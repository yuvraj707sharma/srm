from typing import List, Dict, Any, Optional
import uuid
import logging
from qdrant_client import AsyncQdrantClient
from qdrant_client.http import models as qmodels
from app.services.vector.base import VectorSearchService
from app.core.config import settings

logger = logging.getLogger(__name__)

class QdrantVectorSearchService(VectorSearchService):
    def __init__(self, collection_name: str = None):
        url_or_path = settings.QDRANT_URL
        api_key = settings.QDRANT_API_KEY
        timeout = settings.QDRANT_TIMEOUT

        if url_or_path == ":memory:":
            self.client = AsyncQdrantClient(location=":memory:", api_key=api_key, timeout=timeout)
        elif not url_or_path.startswith("http"):
            self.client = AsyncQdrantClient(path=url_or_path, api_key=api_key, timeout=timeout)
        else:
            self.client = AsyncQdrantClient(url=url_or_path, api_key=api_key, timeout=timeout)

        self.collection_name = collection_name or settings.QDRANT_COLLECTION
        self._initialized = False

    async def initialize(self):
        """Ensures collection exists. Should be called at startup or lazy loaded."""
        if self._initialized:
            return
        
        try:
            collections = await self.client.get_collections()
            if not any(c.name == self.collection_name for c in collections.collections):
                await self.client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=qmodels.VectorParams(
                        size=settings.QDRANT_VECTOR_DIMENSION,
                        distance=qmodels.Distance.COSINE
                    )
                )
                logger.info(f"Created Qdrant collection {self.collection_name}")
            self._initialized = True
        except Exception as e:
            logger.error(f"Failed to initialize Qdrant collection: {e}")
            raise

    async def index(self, document_id: str, text: str, metadata: Dict[str, Any]) -> bool:
        return await self.upsert(document_id, text, metadata)

    async def upsert(self, document_id: str, text: str, metadata: Dict[str, Any], vector: List[float] = None) -> bool:
        """Upsert a point. Vector must be provided if using text embedding models externally."""
        await self.initialize()
        
        if not vector:
            raise ValueError("vector must be provided for Qdrant upsert")

        # Create a deterministic point ID from the document_id (draft_id)
        # qdrant expects a UUID string or integer
        try:
            point_id = str(uuid.UUID(document_id))
        except ValueError:
            # Fallback if document_id is not a valid UUID (though it should be in this system)
            point_id = str(uuid.uuid5(uuid.NAMESPACE_OID, document_id))

        payload = metadata.copy()
        if "text" not in payload:
            payload["text"] = text

        try:
            await self.client.upsert(
                collection_name=self.collection_name,
                points=[
                    qmodels.PointStruct(
                        id=point_id,
                        vector=vector,
                        payload=payload
                    )
                ]
            )
            return True
        except Exception as e:
            logger.error(f"Failed to upsert vector to Qdrant: {e}")
            return False

    async def delete(self, document_id: str, filter_metadata: Dict[str, Any] = None) -> bool:
        await self.initialize()
        
        try:
            point_id = str(uuid.UUID(document_id))
        except ValueError:
            point_id = str(uuid.uuid5(uuid.NAMESPACE_OID, document_id))

        conditions = [qmodels.HasIdCondition(has_id=[point_id])]
        
        if filter_metadata:
            for k, v in filter_metadata.items():
                conditions.append(qmodels.FieldCondition(
                    key=k, match=qmodels.MatchValue(value=v)
                ))

        filter_obj = qmodels.Filter(must=conditions)
        
        try:
            await self.client.delete(
                collection_name=self.collection_name,
                points_selector=filter_obj
            )
            return True
        except Exception as e:
            logger.error(f"Failed to delete vector from Qdrant: {e}")
            return False

    async def search(self, query: str, limit: int = 10, filter_metadata: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        raise NotImplementedError("Text search requires embedding. Use search_by_vector instead.")

    async def search_by_vector(self, query_vector: List[float], limit: int = 10, filter_metadata: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        await self.initialize()

        q_filter = None
        if filter_metadata:
            conditions = []
            for k, v in filter_metadata.items():
                conditions.append(qmodels.FieldCondition(
                    key=k, match=qmodels.MatchValue(value=v)
                ))
            q_filter = qmodels.Filter(must=conditions)

        try:
            results = await self.client.query_points(
                collection_name=self.collection_name,
                query=query_vector,
                query_filter=q_filter,
                limit=limit,
                with_payload=True,
            )

            return [
                {
                    "id": str(hit.id),
                    "score": hit.score,
                    "metadata": hit.payload or {}
                }
                for hit in results.points
            ]
        except Exception as e:
            logger.error(f"Failed to search Qdrant: {e}")
            raise
