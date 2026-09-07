from typing import List, Dict, Any
from app.services.vector.base import VectorSearchService

class LocalVectorSearchService(VectorSearchService):
    def __init__(self):
        self._store = {}
        
    async def index(self, document_id: str, text: str, metadata: Dict[str, Any]) -> bool:
        self._store[document_id] = {"text": text, "metadata": metadata}
        return True
        
    async def upsert(self, document_id: str, text: str, metadata: Dict[str, Any]) -> bool:
        return await self.index(document_id, text, metadata)
        
    async def delete(self, document_id: str, filter_metadata: Dict[str, Any] = None) -> bool:
        if document_id in self._store:
            del self._store[document_id]
            return True
        return False
        
    async def search(self, query: str, limit: int = 10, filter_metadata: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        # Mock implementation for Phase 0
        return []

    async def search_by_vector(self, query_vector: List[float], limit: int = 10, filter_metadata: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        return []
