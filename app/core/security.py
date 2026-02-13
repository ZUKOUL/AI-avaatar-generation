"""
API Key Authentication
Simple header-based authentication using X-API-Key
"""

from fastapi import HTTPException, Security, status
from fastapi.security import APIKeyHeader
from app.core.config import settings


# Define API key header
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(api_key: str = Security(api_key_header)) -> str:
    """
    Verify API key from request header
    
    Args:
        api_key: API key from X-API-Key header
        
    Returns:
        str: Validated API key
        
    Raises:
        HTTPException: If API key is missing or invalid
    """
    if api_key is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": "MISSING_API_KEY",
                "message": "API key is required in X-API-Key header"
            }
        )
    
    if api_key != settings.BACKEND_SECRET_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": "INVALID_API_KEY",
                "message": "Invalid API key provided"
            }
        )
    
    return api_key
