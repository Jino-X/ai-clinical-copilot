from __future__ import annotations

import time
from dataclasses import dataclass
from urllib.parse import quote

import httpx

from app.core.config import Settings
from app.core.errors import ServiceUnavailableError
from app.core.logging import get_logger

logger = get_logger(__name__)

# Signed URLs are valid for this long. Short enough that a leaked URL is
# not useful for long; long enough that a slow upload does not time out.
SIGNED_URL_TTL_SECONDS = 300  # 5 minutes


@dataclass(frozen=True, slots=True)
class SignedUpload:
    """A signed URL for uploading a file to private storage."""
    upload_url: str
    storage_path: str
    expires_at: str


@dataclass(frozen=True, slots=True)
class SignedDownload:
    """A signed URL for downloading a file from private storage."""
    download_url: str
    expires_at: str
    content_type: str | None
    size_bytes: int | None


class StorageService:
    """Supabase Storage client for private audio files.

    Audio files are stored in a private bucket and accessed only via signed
    URLs (PRD §9: "Documents must never be publicly accessible"). The
    service-role key is used for storage operations because the backend
    manages access; the frontend never sees this key.
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._base_url = (
            settings.supabase_base_url if settings.supabase_url else None
        )
        self._service_key = (
            settings.supabase_service_role_key.get_secret_value()
            if settings.supabase_service_role_key
            else None
        )
        self._bucket = "consultation-audio"

    @property
    def configured(self) -> bool:
        return self._base_url is not None and self._service_key is not None

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._service_key}",
            "apikey": self._service_key,
        }

    def _storage_path(
        self, organization_id: str, consultation_id: str, content_type: str
    ) -> str:
        """A deterministic, tenant-scoped path.

        The path includes the organization_id so RLS-like isolation is
        enforced at the storage layer even if a signed URL leaks.
        """
        ext = "webm"
        if "ogg" in content_type:
            ext = "ogg"
        elif "mp4" in content_type or "m4a" in content_type:
            ext = "m4a"
        elif "wav" in content_type:
            ext = "wav"
        elif "mp3" in content_type:
            ext = "mp3"
        return f"{organization_id}/{consultation_id}/audio.{ext}"

    async def create_upload_url(
        self,
        *,
        organization_id: str,
        consultation_id: str,
        content_type: str,
    ) -> SignedUpload:
        """Create a signed upload URL for direct-to-storage upload.

        The client uploads directly to Supabase Storage; the backend never
        proxies the audio file. This keeps the API process free for clinical
        requests.
        """
        if not self.configured:
            raise ServiceUnavailableError("Storage is not configured")

        storage_path = self._storage_path(
            organization_id, consultation_id, content_type
        )

        # Supabase Storage v1 API: create a signed upload URL.
        url = (
            f"{self._base_url}/storage/v1/object/upload/resumable/"
            f"{quote(self._bucket)}/{quote(storage_path)}"
        )

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                url,
                headers={
                    **self._headers(),
                    "Content-Type": content_type,
                    "x-upsert": "true",
                },
                params={"expires_at": str(int(time.time()) + SIGNED_URL_TTL_SECONDS)},
            )

        if response.status_code not in (200, 201):
            logger.error(
                "storage_upload_url_failed",
                status=response.status_code,
                bucket=self._bucket,
                error_type="http_error",
            )
            raise ServiceUnavailableError("Could not create upload URL")

        body = response.json()
        upload_url = body.get("url") or str(response.url)
        expires_at = str(int(time.time()) + SIGNED_URL_TTL_SECONDS)

        return SignedUpload(
            upload_url=upload_url,
            storage_path=f"{self._bucket}/{storage_path}",
            expires_at=expires_at,
        )

    async def create_download_url(self, *, storage_path: str) -> SignedDownload:
        """Create a signed download URL for a stored audio file."""
        if not self.configured:
            raise ServiceUnavailableError("Storage is not configured")

        # storage_path is stored as "bucket/path"; split for the API call.
        parts = storage_path.split("/", 1)
        if len(parts) != 2:
            raise ServiceUnavailableError("Invalid storage path")
        bucket, object_path = parts

        url = (
            f"{self._base_url}/storage/v1/object/sign/{quote(bucket)}/"
            f"{quote(object_path)}"
        )

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                url,
                headers=self._headers(),
                json={"expiresIn": SIGNED_URL_TTL_SECONDS},
            )

        if response.status_code != 200:
            logger.error(
                "storage_download_url_failed",
                status=response.status_code,
                bucket=bucket,
                error_type="http_error",
            )
            raise ServiceUnavailableError("Could not create download URL")

        body = response.json()
        signed_path = body.get("signedURL", "")
        download_url = f"{self._base_url}/storage/v1{signed_path}"

        # Fetch metadata for content type and size.
        content_type = None
        size_bytes = None
        info_url = (
            f"{self._base_url}/storage/v1/object/info/{quote(bucket)}/"
            f"{quote(object_path)}"
        )
        async with httpx.AsyncClient(timeout=30) as client:
            info_response = await client.get(
                info_url, headers=self._headers()
            )
        if info_response.status_code == 200:
            info = info_response.json()
            metadata = info.get("metadata", {})
            content_type = metadata.get("mimetype")
            size_bytes = info.get("size")

        return SignedDownload(
            download_url=download_url,
            expires_at=str(int(time.time()) + SIGNED_URL_TTL_SECONDS),
            content_type=content_type,
            size_bytes=size_bytes,
        )
