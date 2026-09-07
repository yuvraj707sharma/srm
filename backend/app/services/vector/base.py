from abc import ABC, abstractmethod
from typing import List, Dict, Any

class VectorSearchService(ABC):
    @abstractmethod
    async def index(self, document_id: str, text: str, metadata: Dict[str, Any]) -> bool:
        pass
        
    @abstractmethod
    async def upsert(self, document_id: str, text: str, metadata: Dict[str, Any]) -> bool:
        pass
        
    @abstractmethod
    async def delete(self, document_id: str, filter_metadata: Dict[str, Any] = None) -> bool:
        pass
        
    @abstractmethod
    async def search(self, query: str, limit: int = 10, filter_metadata: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        pass
        
    @abstractmethod
    async def search_by_vector(self, query_vector: List[float], limit: int = 10, filter_metadata: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        """Search using a pre-computed vector."""
        pass
