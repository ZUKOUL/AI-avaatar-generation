from dotenv import load_dotenv
import os
load_dotenv()
print(f"URL: {os.getenv('SUPABASE_URL')}")
print(f"KEY: {os.getenv('SUPABASE_KEY')[:10]}...") # Only prints first 10 chars