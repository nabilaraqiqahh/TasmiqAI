"""
TasmiqAI FastAPI Server
========================
Run:  python -m uvicorn tasmiq_api:app --host 0.0.0.0 --port 8001

This server connects to Supabase for all data operations.
"""

import os
import sys
import shutil
import tempfile
import json
import logging
import traceback
import re
from pathlib import Path
from datetime import datetime, timedelta

# Force UTF-8 output on Windows
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# Import FastAPI and related
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any

# Import Supabase
from supabase import create_client, Client

# Import TasmiqAI engine
import tasmiq_app

# Import dotenv to load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv()
    env_path = Path(__file__).resolve().parent / '.env'
    if env_path.exists():
        load_dotenv(dotenv_path=env_path)
except ImportError:
    pass

# ============================================================
# LOGGING CONFIGURATION
# ============================================================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============================================================
# SUPABASE CONFIGURATION
# ============================================================
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://your-project.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "your-anon-key")

# Initialize Supabase client
try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    logger.info("✅ Supabase client initialized successfully")
except Exception as e:
    logger.error(f"❌ Failed to initialize Supabase client: {e}")
    supabase = None

# ============================================================
# PYDANTIC MODELS (Request/Response Schemas)
# ============================================================

class LoginRequest(BaseModel):
    email: str
    password: str

class RegisterRequest(BaseModel):
    email: str
    full_name: str
    password: str
    role: str  # 'student' or 'teacher'

class LoginResponse(BaseModel):
    success: bool
    access_token: Optional[str] = None
    token_type: str = "bearer"
    user_id: Optional[str] = None
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    message: Optional[str] = None
    error: Optional[str] = None

class ClassCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    max_students: int = 30

class InviteCodeRequest(BaseModel):
    class_id: str
    expires_days: int = 30
    max_uses: int = 0  # 0 = unlimited

class EnrollmentActionRequest(BaseModel):
    enrollment_id: str
    action: str  # 'approve' or 'reject'
    rejection_reason: Optional[str] = None

class RecitationSubmitRequest(BaseModel):
    surah_number: int
    start_verse: int
    end_verse: int
    duration_seconds: int

class FeedbackSubmitRequest(BaseModel):
    recitation_id: str
    feedback_text: str
    override_score: Optional[int] = None

# ============================================================
# FASTAPI APP INITIALIZATION
# ============================================================
app = FastAPI(
    title="TasmiqAI API",
    description="Quran Recitation Assessment System",
    version="2.0"
)

# Security
security = HTTPBearer()

# ============================================================
# CORS MIDDLEWARE
# ============================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8081",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "*"  # For testing only - remove in production
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# MOUNT STATIC FILES
# ============================================================
if hasattr(tasmiq_app, 'AUDIO_DIR') and os.path.exists(tasmiq_app.AUDIO_DIR):
    app.mount("/audio", StaticFiles(directory=str(tasmiq_app.AUDIO_DIR)), name="audio")

# ============================================================
# STARTUP EVENT
# ============================================================
@app.on_event("startup")
async def startup_event():
    print("=" * 50)
    print("🚀 TasmiqAI Server Starting...")
    print("=" * 50)
    
    # Check Supabase connection
    if supabase:
        try:
            # Test connection
            response = supabase.table("users").select("count").limit(1).execute()
            print("✅ Connected to Supabase")
        except Exception as e:
            print(f"❌ Supabase connection error: {e}")
    else:
        print("❌ Supabase client not initialized")
    
    # Load Quran dataset
    if tasmiq_app.load_dataset():
        print(f"✅ Dataset loaded: {len(tasmiq_app.quran_data)} surahs")
    else:
        print("⚠️ Dataset failed to load")
    
    # Load AI model
    tasmiq_app.load_model()
    
    print("=" * 50)
    print("✅ Server ready on http://localhost:8001")
    print("=" * 50)

# ============================================================
# HEALTH CHECK
# ============================================================
@app.get("/")
async def root():
    return {
        "message": "TasmiqAI API is running!",
        "status": "online",
        "version": "2.0",
        "supabase_connected": supabase is not None
    }

@app.get("/health")
async def health():
    gemini_ok = tasmiq_app.gemini_client is not None
    api_key = os.environ.get("GEMINI_API_KEY", "")

    # Check ffmpeg
    ffmpeg_path = os.path.join(os.path.dirname(__file__), 'deps', 'imageio_ffmpeg', 'binaries', 'ffmpeg.exe')
    ffmpeg_ok = os.path.exists(ffmpeg_path)

    return {
        "status": "ok",
        "supabase_connected": supabase is not None,
        "dataset_loaded": bool(tasmiq_app.quran_data),
        "dataset_surahs": len(tasmiq_app.quran_data),
        "gemini_ready": gemini_ok,
        "gemini_key_present": bool(api_key),
        "gemini_key_prefix": api_key[:8] + "..." if api_key else "NOT SET",
        "ffmpeg_available": ffmpeg_ok,
        "ffmpeg_path": ffmpeg_path if ffmpeg_ok else "NOT FOUND",
        "engine": "Gemini Flash" if gemini_ok else "Acoustic (ffmpeg decode)",
    }


@app.post("/api/debug-audio")
async def debug_audio(audio: UploadFile = File(...)):
    """Debug endpoint — test audio loading without full AI analysis."""
    import tempfile, shutil
    tmp = None
    try:
        ext = os.path.splitext(audio.filename or 'audio.wav')[1] or '.wav'
        tmp = tempfile.mktemp(suffix=ext)
        with open(tmp, 'wb') as f:
            shutil.copyfileobj(audio.file, f)
        file_size = os.path.getsize(tmp)
        arr = tasmiq_app.process_audio(tmp)
        return {
            "file_size_bytes": file_size,
            "audio_samples": len(arr),
            "duration_seconds": round(len(arr) / 16000, 2) if len(arr) > 0 else 0,
            "loaded_ok": len(arr) > 0,
            "message": "Audio loaded successfully" if len(arr) > 0 else "Audio array is EMPTY — check file format/ffmpeg",
        }
    except Exception as e:
        return {"error": str(e), "loaded_ok": False}
    finally:
        if tmp and os.path.exists(tmp):
            os.remove(tmp)

# ============================================================
# AUTHENTICATION ENDPOINTS
# ============================================================

@app.post("/api/auth/login", response_model=LoginResponse)
async def login_user(request: LoginRequest):
    """
    Login user with email and password
    Supports: @student.tahfiz.my and @staff.tahfiz.my
    """
    try:
        if not supabase:
            raise HTTPException(status_code=500, detail="Supabase client not initialized")
        
        # Query user from Supabase using uid column
        response = supabase.table("users").select("*").eq("email", request.email).execute()
        
        if not response.data or len(response.data) == 0:
            logger.warning(f"Login attempt failed: User not found - {request.email}")
            return LoginResponse(
                success=False,
                error="Invalid email or password"
            )
        
        user = response.data[0]
        
        # Simple password check for testing
        if user["password_hash"] != request.password:
            logger.warning(f"Login attempt failed: Password mismatch - {request.email}")
            return LoginResponse(
                success=False,
                error="Invalid email or password"
            )
        
        # Update last_login
        try:
            supabase.table("users").update({
                "last_login": datetime.now().isoformat()
            }).eq("id", user["id"]).execute()
        except Exception as e:
            logger.warning(f"Failed to update last_login: {e}")
        
        logger.info(f"✅ User logged in: {user['email']} ({user['role']})")
        
        return LoginResponse(
            success=True,
            access_token=f"token_{user.get('uid', user.get('id', ''))}_{datetime.now().timestamp()}",
            token_type="bearer",
            user_id=user.get("uid") or user.get("id"),
            email=user["email"],
            full_name=user.get("full_name") or user.get("display_name") or user.get("email"),
            role=user["role"],
            message=f"Welcome back, {user.get('full_name') or user.get('display_name') or user.get('email')}!"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {traceback.format_exc()}")
        return LoginResponse(
            success=False,
            error=f"Server error: {str(e)}"
        )

@app.post("/api/auth/register", response_model=LoginResponse)
async def register_user(request: RegisterRequest):
    """
    Register a new user
    - Students: email must end with @student.tahfiz.my
    - Teachers: email must end with @staff.tahfiz.my
    """
    try:
        if not supabase:
            raise HTTPException(status_code=500, detail="Supabase client not initialized")
        
        # Validate email format based on role
        if request.role == "student" and not request.email.endswith("@student.tahfiz.my"):
            return LoginResponse(
                success=False,
                error="Student emails must end with @student.tahfiz.my"
            )
        
        if request.role == "teacher" and not request.email.endswith("@staff.tahfiz.my"):
            return LoginResponse(
                success=False,
                error="Teacher emails must end with @staff.tahfiz.my"
            )
        
        # Check if user already exists
        check = supabase.table("users").select("email").eq("email", request.email).execute()
        if check.data and len(check.data) > 0:
            return LoginResponse(
                success=False,
                error="Email already registered"
            )
        
        # Insert user
        user_data = {
            "email": request.email,
            "password_hash": request.password,  # For testing only
            "full_name": request.full_name,
            "role": request.role,
            "progress_percentage": 0,
            "created_at": datetime.now().isoformat()
        }
        
        response = supabase.table("users").insert(user_data).execute()
        
        if not response.data:
            return LoginResponse(
                success=False,
                error="Failed to register user"
            )
        
        user = response.data[0]
        logger.info(f"✅ User registered: {user['email']} ({user['role']})")
        
        return LoginResponse(
            success=True,
            access_token=f"token_{user['id']}_{datetime.now().timestamp()}",
            token_type="bearer",
            user_id=user["id"],
            email=user["email"],
            full_name=user["full_name"],
            role=user["role"],
            message=f"Welcome, {user['full_name']}! Please log in."
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration error: {traceback.format_exc()}")
        return LoginResponse(
            success=False,
            error=f"Server error: {str(e)}"
        )

@app.get("/api/auth/debug-user/{email}")
async def debug_user(email: str):
    """
    Debug endpoint to check if a user exists
    """
    try:
        if not supabase:
            return {"error": "Supabase client not initialized"}
        
        response = supabase.table("users").select("*").eq("email", email).execute()
        
        if not response.data:
            return {
                "exists": False,
                "email": email,
                "all_users": supabase.table("users").select("email").execute().data
            }
        
        user = response.data[0]
        return {
            "exists": True,
            "email": user["email"],
            "full_name": user["full_name"],
            "role": user["role"],
            "password_hash": user["password_hash"],
            "created_at": user.get("created_at")
        }
        
    except Exception as e:
        return {"error": str(e)}

# ============================================================
# AUTHENTICATION HELPER
# ============================================================

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Get current user from JWT token
    For testing: expects token to contain user_id
    """
    token = credentials.credentials
    
    # For testing, extract user_id from token
    if token.startswith("token_"):
        user_id = token.replace("token_", "").split("_")[0]
        try:
            response = supabase.table("users").select("*").eq("id", user_id).execute()
            if response.data:
                return response.data[0]
        except Exception:
            pass
    
    # For production, you'd verify JWT here
    raise HTTPException(status_code=401, detail="Invalid authentication credentials")

# ============================================================
# STUDENT ENDPOINTS
# ============================================================

@app.get("/api/student/dashboard/{user_id}")
async def get_student_dashboard(user_id: str):
    """
    Get student dashboard data
    """
    try:
        if not supabase:
            raise HTTPException(status_code=500, detail="Supabase client not initialized")
        
        # Get user profile
        user_response = supabase.table("users").select("*").eq("id", user_id).execute()
        if not user_response.data:
            raise HTTPException(status_code=404, detail="User not found")
        
        user = user_response.data[0]
        
        if user["role"] != "student":
            return {"error": "User is not a student"}
        
        # Get enrolled classes (approved only)
        classes_response = supabase.table("class_enrollments")\
            .select("classes(*)")\
            .eq("student_id", user_id)\
            .eq("status", "approved")\
            .execute()
        
        enrolled_classes = [c["classes"] for c in classes_response.data if c["classes"]]
        
        # Get pending enrollment requests
        pending_response = supabase.table("class_enrollments")\
            .select("classes(*)")\
            .eq("student_id", user_id)\
            .eq("status", "pending")\
            .execute()
        
        pending_classes = [c["classes"] for c in pending_response.data if c["classes"]]
        
        # Get recent recitations with assessments
        recitations_response = supabase.table("recitations")\
            .select("*, assessments(*)")\
            .eq("user_id", user_id)\
            .order("submitted_at", desc=True)\
            .limit(10)\
            .execute()
        
        recitations = recitations_response.data
        
        # Calculate statistics
        total_recitations = len(recitations)
        scores = [r["assessments"]["score"] for r in recitations if r.get("assessments")]
        avg_score = sum(scores) / len(scores) if scores else 0
        
        return {
            "success": True,
            "profile": user,
            "enrolled_classes": enrolled_classes,
            "pending_classes": pending_classes,
            "recitations": recitations,
            "stats": {
                "total_recitations": total_recitations,
                "average_score": round(avg_score, 1),
                "best_score": max(scores) if scores else 0,
                "progress_percentage": user.get("progress_percentage", 0)
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Student dashboard error: {traceback.format_exc()}")
        return {"success": False, "error": str(e)}

@app.get("/api/student/classes/{user_id}")
async def get_student_classes(user_id: str):
    """
    Get all classes a student is enrolled in (approved only)
    """
    try:
        if not supabase:
            raise HTTPException(status_code=500, detail="Supabase client not initialized")
        
        response = supabase.table("class_enrollments")\
            .select("classes(*)")\
            .eq("student_id", user_id)\
            .eq("status", "approved")\
            .execute()
        
        classes = [c["classes"] for c in response.data if c["classes"]]
        
        return {
            "success": True,
            "classes": classes
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}

# ============================================================
# TEACHER ENDPOINTS
# ============================================================

@app.get("/api/teacher/dashboard/{teacher_id}")
async def get_teacher_dashboard(teacher_id: str):
    """
    Get teacher dashboard data
    """
    try:
        if not supabase:
            raise HTTPException(status_code=500, detail="Supabase client not initialized")
        
        # Get teacher profile
        user_response = supabase.table("users").select("*").eq("id", teacher_id).execute()
        if not user_response.data:
            raise HTTPException(status_code=404, detail="User not found")
        
        teacher = user_response.data[0]
        
        if teacher["role"] != "teacher":
            return {"error": "User is not a teacher"}
        
        # Get teacher's classes
        classes_response = supabase.table("classes")\
            .select("*")\
            .eq("teacher_id", teacher_id)\
            .execute()
        
        classes = classes_response.data
        
        # Get pending enrollment requests for teacher's classes
        class_ids = [c["id"] for c in classes]
        pending_response = supabase.table("class_enrollments")\
            .select("*, users!student_id(*), classes(*)")\
            .in_("class_id", class_ids)\
            .eq("status", "pending")\
            .execute()
        
        pending_requests = pending_response.data
        
        # Get all students in teacher's classes (approved)
        students_response = supabase.table("class_enrollments")\
            .select("users!student_id(*), classes(*)")\
            .in_("class_id", class_ids)\
            .eq("status", "approved")\
            .execute()
        
        students = students_response.data
        
        # Get recent recitations from students in teacher's classes
        student_ids = [s["student_id"] for s in students]
        recitations_response = supabase.table("recitations")\
            .select("*, users(*), assessments(*)")\
            .in_("user_id", student_ids)\
            .order("submitted_at", desc=True)\
            .limit(20)\
            .execute()
        
        recitations = recitations_response.data
        
        # Calculate statistics
        total_students = len(set(s["student_id"] for s in students))
        
        return {
            "success": True,
            "profile": teacher,
            "classes": classes,
            "pending_requests": pending_requests,
            "students": students,
            "recitations": recitations,
            "stats": {
                "total_classes": len(classes),
                "total_students": total_students,
                "pending_requests_count": len(pending_requests),
                "recent_recitations": len(recitations)
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Teacher dashboard error: {traceback.format_exc()}")
        return {"success": False, "error": str(e)}

@app.get("/api/teacher/pending-enrollments/{teacher_id}")
async def get_pending_enrollments(teacher_id: str):
    """
    Get all pending enrollment requests for a teacher
    """
    try:
        if not supabase:
            raise HTTPException(status_code=500, detail="Supabase client not initialized")
        
        # Get teacher's class IDs
        classes_response = supabase.table("classes")\
            .select("id")\
            .eq("teacher_id", teacher_id)\
            .execute()
        
        class_ids = [c["id"] for c in classes_response.data]
        
        if not class_ids:
            return {"success": True, "pending_requests": []}
        
        # Get pending requests
        response = supabase.table("class_enrollments")\
            .select("*, users!student_id(*), classes(*)")\
            .in_("class_id", class_ids)\
            .eq("status", "pending")\
            .order("requested_at", desc=True)\
            .execute()
        
        return {
            "success": True,
            "pending_requests": response.data
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/api/teacher/handle-enrollment")
async def handle_enrollment(request: EnrollmentActionRequest):
    """
    Approve or reject an enrollment request
    """
    try:
        if not supabase:
            raise HTTPException(status_code=500, detail="Supabase client not initialized")
        
        # Get the enrollment
        response = supabase.table("class_enrollments")\
            .select("*")\
            .eq("id", request.enrollment_id)\
            .execute()
        
        if not response.data:
            return {"success": False, "error": "Enrollment not found"}
        
        enrollment = response.data[0]
        
        if request.action == "approve":
            update_data = {
                "status": "approved",
                "reviewed_at": datetime.now().isoformat(),
                "rejection_reason": None
            }
        elif request.action == "reject":
            update_data = {
                "status": "rejected",
                "reviewed_at": datetime.now().isoformat(),
                "rejection_reason": request.rejection_reason or "Request rejected by teacher"
            }
        else:
            return {"success": False, "error": "Invalid action. Use 'approve' or 'reject'"}
        
        # Update enrollment
        result = supabase.table("class_enrollments")\
            .update(update_data)\
            .eq("id", request.enrollment_id)\
            .execute()
        
        if not result.data:
            return {"success": False, "error": "Failed to update enrollment"}
        
        logger.info(f"✅ Enrollment {request.action}ed: {enrollment['student_id']} -> {enrollment['class_id']}")
        
        return {
            "success": True,
            "message": f"Enrollment {request.action}ed successfully",
            "enrollment": result.data[0]
        }
        
    except Exception as e:
        logger.error(f"Enrollment handling error: {traceback.format_exc()}")
        return {"success": False, "error": str(e)}

# ============================================================
# CLASS MANAGEMENT ENDPOINTS
# ============================================================

@app.post("/api/teacher/create-class")
async def create_class(request: ClassCreateRequest):
    """
    Teacher creates a new class with auto-generated code
    """
    try:
        if not supabase:
            raise HTTPException(status_code=500, detail="Supabase client not initialized")
        
        # Generate class code
        base_code = request.name[:3].upper()
        year = datetime.now().strftime("%y")
        
        # Check if code exists and generate unique
        code = f"{base_code}-{year}"
        counter = 1
        
        while True:
            check = supabase.table("classes").select("class_code").eq("class_code", code).execute()
            if not check.data:
                break
            code = f"{base_code}-{year}-{counter}"
            counter += 1
        
        # Insert class
        class_data = {
            "name": request.name,
            "description": request.description,
            "teacher_id": request.teacher_id,
            "class_code": code,
            "max_students": request.max_students,
            "is_active": True,
            "created_at": datetime.now().isoformat()
        }
        
        response = supabase.table("classes").insert(class_data).execute()
        
        if not response.data:
            return {"success": False, "error": "Failed to create class"}
        
        logger.info(f"✅ Class created: {request.name} ({code})")
        
        return {
            "success": True,
            "message": f"Class '{request.name}' created successfully",
            "class": response.data[0],
            "class_code": code
        }
        
    except Exception as e:
        logger.error(f"Create class error: {traceback.format_exc()}")
        return {"success": False, "error": str(e)}

@app.post("/api/teacher/generate-invite")
async def generate_invite_code(request: InviteCodeRequest):
    """
    Generate an invite code for a class
    """
    try:
        if not supabase:
            raise HTTPException(status_code=500, detail="Supabase client not initialized")
        
        # Generate unique invite code
        import random
        import string
        
        code = "INV-" + ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
        
        # Check uniqueness
        while True:
            check = supabase.table("class_invites").select("invite_code").eq("invite_code", code).execute()
            if not check.data:
                break
            code = "INV-" + ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
        
        # Insert invite
        invite_data = {
            "class_id": request.class_id,
            "invite_code": code,
            "created_by": request.created_by,
            "expires_at": (datetime.now() + timedelta(days=request.expires_days)).isoformat(),
            "max_uses": request.max_uses,
            "used_count": 0,
            "is_active": True,
            "created_at": datetime.now().isoformat()
        }
        
        response = supabase.table("class_invites").insert(invite_data).execute()
        
        if not response.data:
            return {"success": False, "error": "Failed to generate invite code"}
        
        logger.info(f"✅ Invite code generated: {code}")
        
        return {
            "success": True,
            "message": "Invite code generated successfully",
            "invite_code": code,
            "invite": response.data[0]
        }
        
    except Exception as e:
        logger.error(f"Generate invite error: {traceback.format_exc()}")
        return {"success": False, "error": str(e)}

# ============================================================
# STUDENT ENROLLMENT ENDPOINTS
# ============================================================

@app.post("/api/student/request-enrollment")
async def request_enrollment(student_id: str, invite_code: str):
    """
    Student requests to join a class using an invite code
    """
    try:
        if not supabase:
            raise HTTPException(status_code=500, detail="Supabase client not initialized")
        
        # Validate invite code
        invite_response = supabase.table("class_invites")\
            .select("*, classes(*)")\
            .eq("invite_code", invite_code)\
            .eq("is_active", True)\
            .execute()
        
        if not invite_response.data:
            return {"success": False, "error": "Invalid or expired invite code"}
        
        invite = invite_response.data[0]
        class_id = invite["class_id"]
        
        # Check if already enrolled
        check = supabase.table("class_enrollments")\
            .select("status")\
            .eq("class_id", class_id)\
            .eq("student_id", student_id)\
            .execute()
        
        if check.data:
            status = check.data[0]["status"]
            if status == "approved":
                return {"success": False, "error": "You are already enrolled in this class"}
            elif status == "pending":
                return {"success": False, "error": "Your enrollment request is already pending"}
        
        # Check if class is full
        if invite["max_uses"] > 0:
            count_response = supabase.table("class_enrollments")\
                .select("count")\
                .eq("class_id", class_id)\
                .eq("status", "approved")\
                .execute()
            
            current_count = count_response.data[0]["count"] if count_response.data else 0
            if current_count >= invite["classes"]["max_students"]:
                return {"success": False, "error": "Class is full"}
        
        # Create enrollment request
        enrollment_data = {
            "class_id": class_id,
            "student_id": student_id,
            "invite_code": invite_code,
            "status": "pending",
            "requested_at": datetime.now().isoformat()
        }
        
        response = supabase.table("class_enrollments").insert(enrollment_data).execute()
        
        if not response.data:
            return {"success": False, "error": "Failed to submit enrollment request"}
        
        # Update invite usage count
        supabase.table("class_invites")\
            .update({"used_count": invite["used_count"] + 1})\
            .eq("id", invite["id"])\
            .execute()
        
        logger.info(f"📩 Enrollment request submitted: {student_id} -> {class_id}")
        
        return {
            "success": True,
            "message": "Enrollment request submitted! Waiting for teacher approval.",
            "enrollment": response.data[0]
        }
        
    except Exception as e:
        logger.error(f"Enrollment request error: {traceback.format_exc()}")
        return {"success": False, "error": str(e)}

# ============================================================
# RECITATION ENDPOINTS
# ============================================================

@app.post("/api/recitations/submit")
async def submit_recitation(
    user_id: str = Form(...),
    surah_number: int = Form(...),
    start_verse: int = Form(...),
    end_verse: int = Form(...),
    duration_seconds: int = Form(...),
    audio: UploadFile = File(...)
):
    """
    Submit a recitation with audio file
    """
    temp_audio_path = None
    
    try:
        if not supabase:
            raise HTTPException(status_code=500, detail="Supabase client not initialized")
        
        # Validate user
        user_response = supabase.table("users").select("role").eq("id", user_id).execute()
        if not user_response.data:
            return {"success": False, "error": "User not found"}
        
        # Save audio file
        filename = audio.filename or "recording.wav"
        temp_audio_path = os.path.join(tempfile.gettempdir(), filename)
        
        with open(temp_audio_path, "wb") as buf:
            shutil.copyfileobj(audio.file, buf)
        
        # Get expected text from Quran dataset
        expected_text = tasmiq_app.get_expected_text_from_db(surah_number, f"{start_verse}-{end_verse}")
        
        # Run AI assessment
        result = tasmiq_app.assess_recitation_detailed(
            surah_label=str(surah_number),
            ayah_num=f"{start_verse}-{end_verse}",
            user_audio_path=temp_audio_path,
            expected_ayah_text=expected_text
        )
        
        # Upload or generate audio_url
        timestamp_str = int(datetime.now().timestamp())
        audio_url = f"https://tasmiq.ai/audio/{user_id}_{timestamp_str}_{filename}"
        try:
            with open(temp_audio_path, "rb") as f:
                audio_bytes = f.read()
            storage_path = f"{user_id}/{timestamp_str}_{filename}"
            supabase.storage.from_("recitations").upload(
                path=storage_path,
                file=audio_bytes,
                file_options={"content-type": audio.content_type or "audio/mpeg"}
            )
            audio_url = supabase.storage.from_("recitations").get_public_url(storage_path)
        except Exception as st_err:
            logger.warning(f"Storage upload warning (using fallback URL): {st_err}")

        # Save recitation to database using correct column names
        recitation_data = {
            "user_id":          user_id,
            "surah_number":     surah_number,
            "start_verse":      start_verse,
            "end_verse":        end_verse,
            "duration_seconds": duration_seconds,
            "audio_url":        audio_url,
            "score":            int(result.get("overall_score", 0)),
            "transcription":    result.get("user_phonetics", ""),
            "memorization_score": int(result.get("memorization_score", 0)),
            "pronunciation_score": int(result.get("pronunciation_score", 0)),
            "tajwid_score":     int(result.get("tajwid_score", 0)),
            "fluency_score":    int(result.get("fluency_score", 0)),
            "feedback":         result.get("feedback", ""),
            "reviewed":         False,
            "submitted_at":     datetime.now().isoformat(),
            "recorded_at":      datetime.now().isoformat(),
        }
        
        rec_response = supabase.table("recitations").insert(recitation_data).execute()
        
        if not rec_response.data:
            return {"success": False, "error": "Failed to save recitation"}
        
        recitation = rec_response.data[0]
        recitation_id = recitation["id"]
        
        # Save to assessments table
        assessment_data = {
            "recitation_id":      recitation_id,
            "user_id":            user_id,
            "memorization_score": int(result.get("memorization_score", 0)),
            "pronunciation_score": int(result.get("pronunciation_score", 0)),
            "tajwid_score":       int(result.get("tajwid_score", 0)),
            "fluency_score":      int(result.get("fluency_score", 0)),
            "overall_score":      int(result.get("overall_score", 0)),
            "transcript":         result.get("user_phonetics", ""),
            "errors_json":        result.get("word_alignments", []),
            "feedback_text":      result.get("feedback", ""),
            "assessed_at":        datetime.now().isoformat(),
        }
        
        try:
            supabase.table("assessments").insert(assessment_data).execute()
        except Exception as ass_err:
            logger.warning(f"Assessment save warning: {ass_err}")
        
        # Update user progress
        try:
            supabase.table("users").update({
                "progress_percentage": int(result.get("memorization_score", 0)),
                "avg_score": int(result.get("overall_score", 0)),
            }).eq("id", user_id).execute()
        except Exception as u_err:
            logger.warning(f"User progress update warning: {u_err}")
        
        logger.info(f"🎙️ Recitation submitted: {user_id} - Surah {surah_number}")
        
        return {
            "success": True,
            "message": "Recitation submitted successfully!",
            "recitation_id": recitation_id,
            "assessment": result
        }
        
    except Exception as e:
        logger.error(f"Recitation submission error: {traceback.format_exc()}")
        return {"success": False, "error": str(e)}
    
    finally:
        if temp_audio_path and os.path.exists(temp_audio_path):
            try:
                os.remove(temp_audio_path)
            except Exception:
                pass

@app.get("/api/recitations/{user_id}")
async def get_user_recitations(user_id: str, limit: int = 50):
    """
    Get all recitations for a user
    """
    try:
        if not supabase:
            raise HTTPException(status_code=500, detail="Supabase client not initialized")
        
        response = supabase.table("recitations")\
            .select("*, assessments(*)")\
            .eq("user_id", user_id)\
            .order("submitted_at", desc=True)\
            .limit(limit)\
            .execute()
        
        return {
            "success": True,
            "recitations": response.data
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/api/recitations/class/{class_id}")
async def get_class_recitations(class_id: str, limit: int = 50):
    """
    Get all recitations for students in a class
    """
    try:
        if not supabase:
            raise HTTPException(status_code=500, detail="Supabase client not initialized")
        
        # Get students in class
        students_response = supabase.table("class_enrollments")\
            .select("student_id")\
            .eq("class_id", class_id)\
            .eq("status", "approved")\
            .execute()
        
        student_ids = [s["student_id"] for s in students_response.data]
        
        if not student_ids:
            return {"success": True, "recitations": []}
        
        # Get recitations
        response = supabase.table("recitations")\
            .select("*, users(*), assessments(*)")\
            .in_("user_id", student_ids)\
            .order("submitted_at", desc=True)\
            .limit(limit)\
            .execute()
        
        return {
            "success": True,
            "recitations": response.data
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}

# ============================================================
# FEEDBACK ENDPOINTS
# ============================================================

@app.post("/api/teacher/feedback")
async def submit_feedback(request: FeedbackSubmitRequest):
    """
    Teacher submits feedback on a recitation
    """
    try:
        if not supabase:
            raise HTTPException(status_code=500, detail="Supabase client not initialized")
        
        # Check if recitation exists
        rec_response = supabase.table("recitations")\
            .select("user_id")\
            .eq("id", request.recitation_id)\
            .execute()
        
        if not rec_response.data:
            return {"success": False, "error": "Recitation not found"}
        
        # Check if feedback already exists
        check = supabase.table("feedback")\
            .select("id")\
            .eq("recitation_id", request.recitation_id)\
            .execute()
        
        if check.data:
            # Update existing feedback
            response = supabase.table("feedback")\
                .update({
                    "feedback_text": request.feedback_text,
                    "override_score": request.override_score,
                    "created_at": datetime.now().isoformat()
                })\
                .eq("recitation_id", request.recitation_id)\
                .execute()
        else:
            # Insert new feedback
            feedback_data = {
                "recitation_id": request.recitation_id,
                "teacher_id": request.teacher_id,
                "feedback_text": request.feedback_text,
                "override_score": request.override_score,
                "created_at": datetime.now().isoformat()
            }
            
            response = supabase.table("feedback").insert(feedback_data).execute()
        
        if not response.data:
            return {"success": False, "error": "Failed to submit feedback"}
        
        logger.info(f"📝 Feedback submitted for recitation: {request.recitation_id}")
        
        return {
            "success": True,
            "message": "Feedback submitted successfully!",
            "feedback": response.data[0]
        }
        
    except Exception as e:
        logger.error(f"Feedback submission error: {traceback.format_exc()}")
        return {"success": False, "error": str(e)}

# ============================================================
# DEPRECATED / LEGACY ENDPOINTS (Keep for compatibility)
# ============================================================

@app.post("/analyze")
async def analyze_recitation(
    surah: int = Form(...),
    ayah: str = Form(...),
    expected_ayah_text: str = Form(None),
    audio: UploadFile = File(...)
):
    """
    Legacy analysis endpoint - kept for compatibility
    """
    temp_audio_path = None
    try:
        # Preserve original file extension so librosa/ffmpeg can decode correctly
        # Web browser sends .webm, mobile sends .m4a/.wav
        filename = audio.filename or "recording.wav"
        ext = os.path.splitext(filename)[1].lower() or '.wav'
        temp_audio_path = tempfile.mktemp(suffix=ext)
        
        with open(temp_audio_path, "wb") as buf:
            shutil.copyfileobj(audio.file, buf)
        
        logger.info(f"/analyze received: filename={filename}, size={os.path.getsize(temp_audio_path)} bytes")
        
        result = tasmiq_app.assess_recitation_detailed(
            surah_label=str(surah),
            ayah_num=ayah,
            user_audio_path=temp_audio_path,
            expected_ayah_text=expected_ayah_text,
        )
        
        return {"status": "success", "result": result}
        
    except Exception as e:
        logger.error(f"Analysis error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))
    
    finally:
        if temp_audio_path and os.path.exists(temp_audio_path):
            try:
                os.remove(temp_audio_path)
            except Exception:
                pass

@app.post("/api/assess-chunk")
async def assess_chunk(
    file: UploadFile = File(...),
    expected_text: str = Form(...)
):
    """
    Live word-tracking chunk endpoint
    """
    import difflib
    import re
    
    def clean_ar(text):
        if not text: return ""
        text = re.sub(r'[\u064B-\u065F\u0670\u06DD]', '', text)
        text = re.sub(r'[\u0623\u0625\u0622\u0671]', '\u0627', text)
        return re.sub(r'[^\u0621-\u064A\s]', '', text).strip()
    
    temp_path = None
    try:
        fname = file.filename or "chunk.wav"
        temp_path = os.path.join(tempfile.gettempdir(), fname)
        with open(temp_path, "wb") as buf:
            shutil.copyfileobj(file.file, buf)
        
        predicted = tasmiq_app.get_phonetics_with_context(temp_path, expected_text)
        detected = [w for w in clean_ar(predicted).split() if w]
        target = [w for w in clean_ar(expected_text).split() if w]
        
        matched = 0
        for w in detected:
            if matched < len(target):
                r = difflib.SequenceMatcher(None, clean_ar(w), target[matched]).ratio()
                if r >= 0.65:
                    matched += 1
        
        return {"matched_word_count": matched}
        
    except Exception as e:
        logger.error(f"Chunk assessment error: {e}")
        return {"matched_word_count": 0}
    
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass

# ============================================================
# MAIN EXECUTION
# ============================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "tasmiq_api:app",
        host="0.0.0.0",
        port=8001,
        reload=True
    )