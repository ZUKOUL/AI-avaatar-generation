from fastapi import HTTPException, Security, status
from fastapi.security import APIKeyHeader
from app.core.config import settings

# Define the header to look for
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

async def verify_api_key(api_key: str = Security(api_key_header)):
    """
    Validates that the request has the correct X-API-Key header.
    This function will be used as a dependency for your routes.
    """
    # 1. Check if the header exists
    if api_key is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": "MISSING_API_KEY",
                "message": "API key is required in 'X-API-Key' header."
            }
        )
    
    # 2. Check if the key matches your backend secret
    if api_key != settings.BACKEND_SECRET_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": "INVALID_API_KEY",
                "message": "The provided API key is invalid."
            }
        )
    
    return api_key