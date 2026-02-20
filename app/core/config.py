from dotenv import load_dotenv
import os

load_dotenv()

class Settings:
    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_KEY")
    JWT_SECRET = os.getenv("JWT_SECRET", "")
    JWT_EXPIRE_SECONDS = int(os.getenv("JWT_EXPIRE_SECONDS", "604800"))  # 7 days

settings = Settings()
