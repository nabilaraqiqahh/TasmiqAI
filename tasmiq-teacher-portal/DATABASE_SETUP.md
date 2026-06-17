# Supabase Database Setup Guide

## Why the Teacher Portal Isn't Linking to the Database

The teacher portal is trying to access Supabase database tables that **don't exist yet**. The tables need to be created with the proper schema and security policies.

## Quick Setup Steps

### 1. Open Supabase Console
Go to https://app.supabase.com and sign in to your project.

### 2. Create Tables Using SQL Script

1. Navigate to **SQL Editor** in Supabase
2. Click **New Query**
3. Copy all content from `supabase_schema.sql` into the editor
4. Click **Run** to execute

This will create:
- ✅ `users` table (for teachers/students)
- ✅ `classes` table (for course management)
- ✅ `class_enrollments` table (student-class relationships)
- ✅ `recitations` table (student audio submissions)
- ✅ `announcements` table (teacher announcements)
- ✅ `murajaah_sessions` table (review sessions)
- ✅ `progress_tracking` table (student progress)

### 3. Verify RLS is Enabled

All tables should have Row-Level Security enabled automatically. Verify in Supabase:
- Go to **Authentication → Policies**
- Confirm all tables have policies listed

### 4. Test the Connection

Once tables are created:
1. Restart the teacher portal: `npm run dev`
2. Log in with your teacher account
3. Go to **Review** tab → should now load recitations (if any exist)

## Important Notes

⚠️ **Security**: The Supabase credentials in `src/supabase.js` have anon key. This allows:
- Unauthenticated users to view public data
- Authenticated users to access data per RLS policies

✅ **RLS Policies**: All tables have policies that ensure:
- Teachers only see their own classes
- Students only see their own submissions
- Only teachers can create announcements in their classes

## Troubleshooting

**Issue**: "Relation does not exist" error in portal
- **Solution**: Run the SQL schema script again in Supabase SQL Editor

**Issue**: "Permission denied" errors
- **Solution**: Check that RLS policies were created (should have happened automatically with the script)

**Issue**: Can't see student submissions
- **Solution**: Make sure students are enrolled in the class and have submitted recitations

## Database Schema Overview

```
users (uid, email, role, displayName, avgScore)
    ↓
classes (id, teacherId, name, code, level)
    ↓
class_enrollments (classId, studentId, status)
    ↓
recitations (id, studentId, classId, surah, ayah, audioUrl, feedback, reviewed)
    ↓
progress_tracking (studentId, classId, surah, ayah, grade)
```

## Credentials

Your Supabase connection is already configured in:
- `src/supabase.js` - Contains project URL and anon key

If you need to update credentials:
1. Copy the URL and anon key from Supabase → Settings → API
2. Update `src/supabase.js` with new values
