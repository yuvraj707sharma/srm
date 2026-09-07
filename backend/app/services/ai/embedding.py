from abc import ABC, abstractmethod
from typing import List
import logging
import asyncio
from google import genai
from google.genai import errors

from app.core.config import settings

logger = logging.getLogger(__name__)


class EmbeddingProviderError(Exception):
    """Raised when the upstream embedding provider fails."""
    pass


class EmbeddingProvider(ABC):
    """Abstract provider for generating text embeddings."""
    @abstractmethod
    async def generate_embedding(self, text: str) -> List[float]:
        """Generate a vector embedding for the given text."""
        pass


class GeminiEmbeddingProvider(EmbeddingProvider):
    """Gemini-backed embedding provider."""
    def __init__(self) -> None:
        api_key = settings.GEMINI_API_KEY
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured for embeddings.")
        self._client = genai.Client(api_key=api_key)
        self._model_name = settings.GEMINI_EMBEDDING_MODEL

    async def generate_embedding(self, text: str) -> List[float]:
        if len(text) > settings.GEMINI_MAX_INPUT_CHARS:
            text = text[:settings.GEMINI_MAX_INPUT_CHARS]

        last_exc = None
        for attempt in range(1, settings.GEMINI_MAX_RETRIES + 2):
            try:
                loop = asyncio.get_running_loop()
                result = await asyncio.wait_for(
                    loop.run_in_executor(None, self._sync_embed, text),
                    timeout=settings.GEMINI_TIMEOUT,
                )
                return result
            except asyncio.TimeoutError as exc:
                last_exc = exc
                logger.warning("Gemini embedding timeout (attempt %d)", attempt)
            except errors.APIError as exc:
                last_exc = exc
                logger.warning("Gemini embedding rate-limited (attempt %d): %s", attempt, exc)
            except TimeoutError as exc:
                last_exc = exc
                logger.warning("Gemini embedding deadline exceeded (attempt %d)", attempt)
            except errors.ClientError as exc:
                raise EmbeddingProviderError(f"Invalid argument to Gemini embedding: {exc}")
            except Exception as exc: # Fallback
                last_exc = exc
                logger.warning("GoogleAPIError embedding (attempt %d): %s", attempt, type(exc).__name__)
            
            if attempt <= settings.GEMINI_MAX_RETRIES:
                await asyncio.sleep(2 ** attempt)

        raise EmbeddingProviderError(f"Gemini embedding failed after {settings.GEMINI_MAX_RETRIES + 1} attempts. Last error: {type(last_exc).__name__}")

    def _sync_embed(self, text: str) -> List[float]:
        response = self._client.models.embed_content(
            model=self._model_name,
            contents=text,
            config={"output_dimensionality": settings.QDRANT_VECTOR_DIMENSION}
        )
        embedding = response.embeddings[0].values if response.embeddings else None
        if not embedding:
            raise EmbeddingProviderError("Gemini returned empty embedding.")
        return embedding
