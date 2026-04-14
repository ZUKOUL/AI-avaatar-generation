from dotenv import load_dotenv
import os

load_dotenv()

class Settings:
    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_KEY")
    JWT_SECRET = os.getenv("JWT_SECRET", "")
    JWT_EXPIRE_SECONDS = int(os.getenv("JWT_EXPIRE_SECONDS", "604800"))  # 7 days
    STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRETE_KEY", "")
    STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
    STRIPE_PRICE_ID_CREATOR  = os.getenv("STRIPE_PRICE_ID_CREATOR", "price_1T6Pd6BnAnTuqTl3BBYJxdJ8")
    STRIPE_PRICE_ID_STUDIO   = os.getenv("STRIPE_PRICE_ID_STUDIO", "price_1TLuKfBnAnTuqTl3IEwp4EBF")
    RESEND_API_KEY           = os.getenv("RESEND_API_KEY", "")
    FRONTEND_URL             = os.getenv("FRONTEND_URL", "http://localhost:3000")

settings = Settings()
