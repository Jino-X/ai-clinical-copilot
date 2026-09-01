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
    """Supabase Storage client for private files.

    Files are stored in private buckets and accessed only via signed URLs
    (PRD §9: "Documents must never be publicly accessible"). The service-role
    key is used for storage operations because the backend manages access;
    the frontend never sees this key.
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._base_url = settings.supabase_base_url if settings.supabase_url else None
        self._service_key = (
            settings.supabase_service_role_key.get_secret_value()
            if settings.supabase_service_role_key
            else None
        )
        self._audio_bucket = "consultation-audio"
        self._document_bucket = "medical-documents"

    @property
    def configured(self) -> bool:
        return self._base_url is not None and self._service_key is not None

    def _headers(self) -> dict[str, str]:
        # configured() is checked before any call that uses headers, so
        # _service_key is guaranteed non-None here.
        if self._service_key is None:  # pragma: no cover
            raise ServiceUnavailableError("Storage is not configured")
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

        storage_path = self._storage_path(organization_id, consultation_id, content_type)

        # Supabase Storage v1 API: create a signed upload URL.
        # POST /object/upload/sign/{bucket}/{path} returns a signed URL + token.
        url = (
            f"{self._base_url}/storage/v1/object/upload/sign/"
            f"{quote(self._audio_bucket)}/{quote(storage_path)}"
        )

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                url,
                headers={
                    **self._headers(),
                    "Content-Type": "application/json",
                    "x-upsert": "true",
                },
                json={},
            )

        if response.status_code not in (200, 201):
            logger.error(
                "storage_upload_url_failed",
                status=response.status_code,
                bucket=self._audio_bucket,
                error_type="http_error",
                detail=response.text[:200],
            )
            raise ServiceUnavailableError("Could not create upload URL")

        body = response.json()
        # The API returns a relative path like "/object/upload/sign/...?token=..."
        # Build the full URL the client PUTs to.
        signed_path = body.get("url") or body.get("signedUrl") or ""
        if signed_path.startswith("http"):
            upload_url = signed_path
        elif signed_path:
            upload_url = f"{self._base_url}/storage/v1{signed_path}"
        else:
            upload_url = str(response.url)
        expires_at = str(int(time.time()) + SIGNED_URL_TTL_SECONDS)

        return SignedUpload(
            upload_url=upload_url,
            storage_path=f"{self._audio_bucket}/{storage_path}",
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
            info_response = await client.get(info_url, headers=self._headers())
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

    # --- Documents ------------------------------------------------------------

    def _document_storage_path(
        self, organization_id: str, document_id: str, file_name: str
    ) -> str:
        """A tenant-scoped path for a medical document."""
        # Preserve the file extension from the original name.
        ext = ""
        if "." in file_name:
            ext = "." + file_name.rsplit(".", 1)[-1].lower()
        return f"{organization_id}/{document_id}/document{ext}"

    async def create_document_upload_url(
        self,
        *,
        organization_id: str,
        document_id: str,
        file_name: str,
        content_type: str,
    ) -> SignedUpload:
        """Create a signed upload URL for a medical document."""
        if not self.configured:
            raise ServiceUnavailableError("Storage is not configured")

        storage_path = self._document_storage_path(
            organization_id, document_id, file_name
        )

        url = (
            f"{self._base_url}/storage/v1/object/upload/sign/"
            f"{quote(self._document_bucket)}/{quote(storage_path)}"
        )

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                url,
                headers={
                    **self._headers(),
                    "Content-Type": "application/json",
                    "x-upsert": "true",
                },
                json={},
            )

        if response.status_code not in (200, 201):
            logger.error(
                "storage_document_upload_url_failed",
                status=response.status_code,
                bucket=self._document_bucket,
                error_type="http_error",
                detail=response.text[:200],
            )
            raise ServiceUnavailableError("Could not create upload URL")

        body = response.json()
        signed_path = body.get("url") or body.get("signedUrl") or ""
        if signed_path.startswith("http"):
            upload_url = signed_path
        elif signed_path:
            upload_url = f"{self._base_url}/storage/v1{signed_path}"
        else:
            upload_url = str(response.url)
        expires_at = str(int(time.time()) + SIGNED_URL_TTL_SECONDS)

        return SignedUpload(
            upload_url=upload_url,
            storage_path=f"{self._document_bucket}/{storage_path}",
            expires_at=expires_at,
        )

    async def download_document(self, *, storage_path: str) -> tuple[bytes, str | None]:
        """Download a document's raw bytes via a signed URL.

        Returns (content_bytes, content_type). Used for OCR/extraction.
        """
        signed = await self.create_download_url(storage_path=storage_path)
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.get(signed.download_url)

        if response.status_code != 200:
            raise ServiceUnavailableError("Could not download document")

        return response.content, signed.content_type
