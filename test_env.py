# test_env.py
import os
from dotenv import load_dotenv
from supabase import create_client

# Load .env
load_dotenv()

print("=" * 50)
print("🔍 Testing Environment Variables")
print("=" * 50)

# Check Supabase
URL = os.getenv("SUPABASE_URL")
KEY = os.getenv("SUPABASE_KEY")

print(f"📡 Supabase URL: {URL[:30]}...")

try:
    supabase = create_client(URL, KEY)
    response = supabase.table("users").select("count").limit(1).execute()
    print("✅ Supabase connection successful!")
    print(f"   Users count: {response.data[0]['count'] if response.data else 0}")
except Exception as e:
    print(f"❌ Supabase error: {e}")

# Check Gemini
GEMINI_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_KEY and GEMINI_KEY != "YOUR_NEW_KEY_HERE":
    print("✅ Gemini API key found")
    print(f"   Key starts with: {GEMINI_KEY[:10]}...")
else:
    print("⚠️  Gemini API key not set or still placeholder")

print("=" * 50)