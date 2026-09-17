from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "JECRC SCM API"
    API_V1_STR: str = "/api/v1"
    
    DATABASE_URL: str
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_MODEL: str = "gemini-3.7-flash"
    GEMINI_MAX_INPUT_CHARS: int = 4_000_000  # ~1M tokens; supports 100+ page PDFs
    GEMINI_TIMEOUT: int = 180             # Longer timeout for large catalogs
    GEMINI_MAX_RETRIES: int = 3           # transient-error retries inside GeminiService
    GEMINI_EMBEDDING_MODEL: str = "gemini-embedding-2"
    
    QDRANT_URL: str = "http://localhost:6333"
    QDRANT_API_KEY: Optional[str] = None
    QDRANT_COLLECTION: str = "catalog_products"
    QDRANT_TIMEOUT: int = 30
    QDRANT_VECTOR_DIMENSION: int = 768
    
    STORAGE_PATH: str = "./storage"
    JWT_SECRET_KEY: str
    SUBMISSION_SECRET_KEY: str
    
    # Auth configuration
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    COOKIE_SECURE: bool = True
    COOKIE_SAMESITE: str = "lax"
    MAX_LOGIN_ATTEMPTS: int = 5
    ACCOUNT_LOCKOUT_MINUTES: int = 15
    MAX_UPLOAD_SIZE_BYTES: int = 7 * 1024 * 1024  # 7 MB default
    
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: Optional[int] = None
    SMTP_USERNAME: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    
    # Connection Pool Settings
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_TIMEOUT: int = 30
    DB_POOL_RECYCLE: int = 1800
    
    CORS_ORIGINS: str = "http://localhost:3000"
    ENVIRONMENT: str = "development"

    @property
    def parsed_cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    from pydantic import model_validator

    @model_validator(mode='after')
    def validate_production(self):
        if self.ENVIRONMENT == "production":
            # JWT secrets
            if not self.JWT_SECRET_KEY or self.JWT_SECRET_KEY in ("default_secret", "generate-a-secure-key-here", "test_secret"):
                raise ValueError("JWT_SECRET_KEY must be a secure value in production")
            if len(self.JWT_SECRET_KEY) < 32:
                raise ValueError("JWT_SECRET_KEY must be at least 32 characters in production")
            
            # Gemini
            if not self.GEMINI_API_KEY:
                raise ValueError("GEMINI_API_KEY must be set in production")
                
            # CORS
            if self.CORS_ORIGINS.strip() == "*":
                raise ValueError("Wildcard CORS is not allowed in production")
            if not self.parsed_cors_origins:
                raise ValueError("CORS_ORIGINS must be set in production")

        return self

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)

settings = Settings()
