from __future__ import annotations

import asyncio
import os
import tempfile
from typing import Any

from app.core.config import Settings
from app.core.errors import ServiceUnavailableError
from app.core.logging import get_logger
from app.providers.transcription.base import (
    TranscriptionProvider,
    TranscriptionResult,
)

logger = get_logger(__name__)


class IndicConformerProvider(TranscriptionProvider):
    """AI4Bharat IndicConformer transcription provider.

    Uses the Hugging Face 600M multilingual model
    (``ai4bharat/indic-conformer-600m-multilingual``) via the transformers
    library with ``trust_remote_code=True``.

    The model is loaded lazily on the first transcription call to avoid
    importing heavy dependencies (torch, torchaudio, transformers) at
    application startup. This allows the API to start even when the STT
    dependencies are not installed.

    Audio is converted to 16 kHz mono WAV (the format required by
    IndicConformer) using ffmpeg before inference.

    Limitations of the official model (documented, not fabricated):
    - No built-in Tamil-English code-switching mode; a single language_id
      is passed. Tamil is the default since the typical distribution is
      ~75% Tamil / ~25% English.
    - No timestamps, confidence scores, or speaker diarization.
    - Officially targets CPU/CUDA; MPS is not officially supported but
      works via the device setting.

    Configuration:
    - ``INDICCONFORMER_MODEL``: Hugging Face model ID
    - ``INDICCONFORMER_LANGUAGE``: language code (e.g., "ta" for Tamil)
    - ``INDICCONFORMER_DECODER``: "ctc" or "rnnt"
    - ``INDICCONFORMER_DEVICE``: "cpu", "mps", or "cuda"
    """

    def __init__(self, settings: Settings) -> None:
        self._model_id = settings.indicconformer_model
        self._language = settings.indicconformer_language
        self._decoder = settings.indicconformer_decoder
        self._device = settings.indicconformer_device
        self._model: Any = None
        self._lock = asyncio.Lock()

    @property
    def name(self) -> str:
        return "indicconformer"

    @property
    def model(self) -> str:
        return self._model_id

    def _ensure_model(self) -> Any:
        """Lazily load the IndicConformer model on first use."""
        if self._model is not None:
            return self._model

        try:
            import torch  # noqa: F401
            from transformers import AutoModel
        except ImportError as exc:
            raise ServiceUnavailableError(
                "IndicConformer dependencies not installed. "
                "Install with: pip install torch torchaudio transformers"
            ) from exc

        logger.info(
            "indicconformer_loading_model",
            model=self._model_id,
            device=self._device,
        )

        self._model = AutoModel.from_pretrained(
            self._model_id,
            trust_remote_code=True,
        ).to(self._device)
        self._model.eval()

        logger.info("indicconformer_model_loaded", model=self._model_id)
        return self._model

    async def transcribe(
        self,
        *,
        audio_data: bytes,
        content_type: str,
        language: str | None = None,
    ) -> TranscriptionResult:
        lang = language or self._language
        model = self._ensure_model()

        # Write audio to a temp file, convert to 16kHz mono WAV with ffmpeg,
        # then load with torchaudio.
        with tempfile.NamedTemporaryFile(
            suffix=self._ext_for_content_type(content_type),
            delete=False,
        ) as tmp_in:
            tmp_in.write(audio_data)
            tmp_in_path = tmp_in.name

        tmp_wav_path = tmp_in_path.rsplit(".", 1)[0] + "_16k.wav"

        try:
            # Convert to 16kHz mono WAV using ffmpeg.
            convert_proc = await asyncio.create_subprocess_exec(
                "ffmpeg",
                "-y",
                "-i",
                tmp_in_path,
                "-ac",
                "1",
                "-ar",
                "16000",
                tmp_wav_path,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.PIPE,
            )
            _, _stderr = await convert_proc.communicate()
            if convert_proc.returncode != 0:
                logger.error(
                    "indicconformer_ffmpeg_failed",
                    returncode=convert_proc.returncode,
                )
                raise ServiceUnavailableError("Audio conversion failed (ffmpeg)")

            # Run inference in a thread to avoid blocking the event loop.
            text = await asyncio.to_thread(
                self._run_inference,
                model,
                tmp_wav_path,
                lang,
            )

            return TranscriptionResult(
                full_text=text,
                provider=self.name,
                model=self._model_id,
                language=lang,
            )

        finally:
            if os.path.exists(tmp_in_path):
                os.unlink(tmp_in_path)
            if os.path.exists(tmp_wav_path):
                os.unlink(tmp_wav_path)

    def _run_inference(self, model: Any, wav_path: str, language: str) -> str:
        """Run IndicConformer inference (called in a thread)."""
        import torch
        import torchaudio

        wav, sr = torchaudio.load(wav_path)
        wav = torch.mean(wav, dim=0, keepdim=True)
        if sr != 16000:
            wav = torchaudio.transforms.Resample(sr, 16000)(wav)

        # The HF model's __call__ accepts (wav, language_id, decoder_type).
        text = model(wav, language, self._decoder)

        # The model may return a string or a list with one string.
        if isinstance(text, list):
            text = text[0] if text else ""

        return str(text).strip()

    @staticmethod
    def _ext_for_content_type(content_type: str) -> str:
        if "webm" in content_type:
            return ".webm"
        if "ogg" in content_type:
            return ".ogg"
        if "mp4" in content_type or "m4a" in content_type:
            return ".m4a"
        if "wav" in content_type:
            return ".wav"
        if "mp3" in content_type:
            return ".mp3"
        if "flac" in content_type:
            return ".flac"
        return ".webm"
