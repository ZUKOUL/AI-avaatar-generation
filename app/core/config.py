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
    STRIPE_PRICE_ID_STARTER  = os.getenv("STRIPE_PRICE_ID_STARTER", "")
    STRIPE_PRICE_ID_STANDARD = os.getenv("STRIPE_PRICE_ID_STANDARD", "")
    STRIPE_PRICE_ID_PRO      = os.getenv("STRIPE_PRICE_ID_PRO", "")

settings = Settings()
