from dataclasses import dataclass

import httpx2

from app.config import Settings


@dataclass(frozen=True)
class ElevenLabsSpeechProvider:
    api_key: str
    voice_id: str
    model_id: str
    timeout_seconds: float

    async def synthesize(self, text: str) -> bytes:
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{self.voice_id}"
        async with httpx2.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(
                url,
                params={"output_format": "mp3_44100_128"},
                headers={
                    "Accept": "audio/mpeg",
                    "Content-Type": "application/json",
                    "xi-api-key": self.api_key,
                },
                json={"text": text, "model_id": self.model_id},
            )
            response.raise_for_status()
            return response.content


def create_elevenlabs_speech_provider(
    settings: Settings,
) -> ElevenLabsSpeechProvider | None:
    if not settings.elevenlabs_api_key:
        return None
    return ElevenLabsSpeechProvider(
        api_key=settings.elevenlabs_api_key,
        voice_id=settings.elevenlabs_voice_id,
        model_id=settings.elevenlabs_model_id,
        timeout_seconds=settings.elevenlabs_timeout_seconds,
    )
