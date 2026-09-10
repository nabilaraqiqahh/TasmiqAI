import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
sb = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

try:
    print("--- LATEST RECITATIONS ---")
    r = sb.table("recitations").select("*").order("recorded_at", desc=True).limit(5).execute()
    for row in r.data:
        print(f"ID: {row.get('id')} | Student: {row.get('student_name')}")
        print(f"Surah: {row.get('surah')} | Ayah: {row.get('ayah')}")
        print(f"Audio URL: {row.get('audio_url')}")
        print(f"Recorded At: {row.get('recorded_at')}")
        print("-" * 40)

    print("\n--- BUCKETS ---")
    buckets = sb.storage.list_buckets()
    for b in buckets:
        print(f"Bucket ID: {b.id} | Public: {b.public}")

    print("\n--- RECITATIONS STORAGE OBJECTS ---")
    # List files in the 'recitations' bucket
    files = sb.storage.from_("recitations").list("", {"limit": 100})
    for f in files:
        if isinstance(f, dict):
            print(f"Name: {f.get('name')} | Metadata: {f.get('metadata')}")
        else:
            print(f"Name: {f.name} | Created At: {f.created_at}")

except Exception as e:
    print("Error:", str(e))
