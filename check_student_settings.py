import os, sys
from dotenv import load_dotenv
from supabase import create_client

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

load_dotenv()
sb = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

# List of tables we might want to check
tables = ["student_settings", "user_settings", "users", "class_members", "join_requests", "classes"]

for t in tables:
    try:
        r = sb.table(t).select("*").limit(1).execute()
        print(f"Table '{t}' EXISTS. Columns:", list(r.data[0].keys()) if r.data else "(empty)")
    except Exception as e:
        print(f"Table '{t}' check error:", str(e)[:200])
