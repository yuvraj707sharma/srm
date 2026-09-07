import os
import uuid
import aiofiles
from pathlib import Path
from app.services.storage.base import StorageService
from app.core.config import settings
from app.core.exceptions import APIException

class LocalStorageService(StorageService):
    def __init__(self):
        self.base_path = Path(settings.STORAGE_PATH).resolve()
        self.base_path.mkdir(parents=True, exist_ok=True)
        
    def _get_safe_path(self, key: str) -> Path:
        target_path = (self.base_path / key).resolve()
        if not str(target_path).startswith(str(self.base_path)):
            raise APIException("PATH_TRAVERSAL_ERROR", "Invalid storage path detected.", 403)
        return target_path

    async def put(self, key: str, data: bytes) -> str:
        target_path = self._get_safe_path(key)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        async with aiofiles.open(target_path, 'wb') as f:
            await f.write(data)
        return key
        
    async def get(self, key: str) -> bytes:
        target_path = self._get_safe_path(key)
        if not target_path.exists():
            raise APIException("NOT_FOUND", "File not found.", 404)
        async with aiofiles.open(target_path, 'rb') as f:
            return await f.read()
            
    async def delete(self, key: str) -> bool:
        target_path = self._get_safe_path(key)
        if target_path.exists():
            target_path.unlink()
            return True
        return False
        
    async def exists(self, key: str) -> bool:
        target_path = self._get_safe_path(key)
        return target_path.exists()
