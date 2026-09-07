import pytest
import os
from app.services.storage.local import LocalStorageService
from app.core.exceptions import APIException

@pytest.mark.asyncio
async def test_local_storage():
    storage = LocalStorageService()
    key = "test_file.txt"
    data = b"test content"
    
    # Test put
    stored_key = await storage.put(key, data)
    assert stored_key == key
    
    # Test exists
    assert await storage.exists(key) is True
    
    # Test get
    retrieved = await storage.get(key)
    assert retrieved == data
    
    # Test delete
    assert await storage.delete(key) is True
    assert await storage.exists(key) is False

@pytest.mark.asyncio
async def test_path_traversal():
    storage = LocalStorageService()
    with pytest.raises(APIException):
        await storage.put("../test.txt", b"hack")
