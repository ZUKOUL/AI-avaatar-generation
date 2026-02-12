import os
from fastapi import HTTPException, Security, status
from fastapi.security import APIKeyHeader

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

async def verify_api_key(api_key: str = Security(api_key_header)):
    #1. Debug: Did we even get called?
    print(f"\n AUTH CHECK: Header received = '{api_key}'", flush=True)

    #2. Get Secret from Environment
    backend_secret = os.getenv("BACKEND_SECRET_KEY")
    
    #3. Critical Check: Is the secret missing from .env?
    if not backend_secret:
        print(" CRITICAL ERROR: 'BACKEND_SECRET_KEY' is missing from .env file!", flush=True)
        raise HTTPException(
            status_code=500,
            detail="Server Config Error: BACKEND_SECRET_KEY is missing."
        )

    #4. Check if Header is missing
    if api_key is None:
        print(" AUTH FAIL: No X-API-Key header provided.", flush=True)
        raise HTTPException(
            status_code=401,
            detail="Missing API Key."
        )
    
    #5. Check if Key matches
    if api_key != backend_secret:
        print(f" AUTH FAIL: Key mismatch. Expected '{backend_secret}' but got '{api_key}'", flush=True)
        raise HTTPException(
            status_code=401,
            detail="Invalid API Key."
        )
    
    print(" AUTH SUCCESS: Access Granted.", flush=True)
    return api_key