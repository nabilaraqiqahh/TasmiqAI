# TasmiqAI — Complete Database Integration Audit Report
Generated: June 2026

---

## SECTION 1 — Connected Features ✅

### Teacher Portal
- Login (custom password_hash query on public.users) ✅
- Register (INSERT into public.users) ✅
- Dashboard — fetches users(role=student), recitations ✅
- Recitation Review — SELECT/UPDATE recitations ✅
- Class Management — SELECT/INSERT/UPDATE/DELETE classes ✅
- Pending Requests — SELECT/UPDATE join_requests, INSERT class_members ✅
- Announcements — SELECT/INSERT/DELETE announcements ✅
- Analytics — SELECT recitations, users(role=student) ✅
- Reports — SELECT recitations, users, classes ✅
- Student Profile — SELECT users, recitations by student_id ✅
- Students Roster — SELECT users(role=student) ✅
- Murajaah Monitoring — SELECT users, class_members, recitations ✅
- Notifications (sidebar bell) — SELECT join_requests, recitations ✅

### Mobile App
- Login — Supabase Auth ✅
- Register — Supabase Auth + INSERT public.users ✅
- Dashboard — getUserProfile, getStudentAnnouncements ✅
- Join Class — SELECT classes, INSERT join_requests ✅
- History — getRecitationHistory (SELECT recitations by student_id) ✅
- Profile — getUserProfile, updateUserProfile, changePassword ✅
- Audio Recording — upload to Supabase Storage + INSERT recitations ✅
- AI Assessment — saves to recitations table ✅

---

## SECTION 2 — Partially Connected Features ⚠️

| Feature | Issue |
|---|---|
| Teacher Portal Login | Works for new registered users only. Existing DB users fail if RLS blocks anon SELECT |
| recitationService.js | Uses camelCase column names (studentId, audioUrl, recordedAt) but DB uses snake_case |
| authService.js (mobile) | Inserts `displayName`, `streakDays`, `totalSessions`, `avgScore` — none exist in schema |
| Dashboard stats | avg_score calculation works but "4 new this week" is hardcoded |
| Reports screen | Uses `recordedAt` / `studentId` — should be `recorded_at` / `student_id` |
| Student Profile | Fetches `studentId` column — DB has `student_id` |
| Murajaah Monitoring | Filters by `r.studentId` — DB has `r.student_id` |
| tasmiq_api.py | Uses `user_id` column in recitations, but recitations schema uses `student_id` |
| tasmiq_api.py | Uses `assessments` table that does not exist in current schema |
| Progress Screen (mobile) | All data is hardcoded — not connected to DB at all |

---

## SECTION 3 — Missing Database Connections ❌

1. **Progress Screen** — 100% mock data. Sessions=24, AvgScore=85%, Streak=7, chart data, surah progress all hardcoded.
2. **Achievement System** — No achievements table, no badges, no milestone tracking anywhere.
3. **Notification Center** — No `notifications` table. Teacher portal reads live DB; mobile has no notification inbox.
4. **Hint System** — No hint tracking, no `hint_count` column, no repeat trigger after 5 hints.
5. **Murajaah Module (mobile)** — MurajaahModeScreen.js exists but no DB save for murajaah session results.
6. **Student Progress Tracking** — `progress_tracking` table exists in schema but is never written to.
7. **Streak update on recitation** — `updateUserStreak` writes to `streakDays`/`totalSessions` but those columns don't exist in schema.
8. **tasmiq_api.py student dashboard** — References `class_enrollments.student_id` and `recitations.user_id` — column name mismatch.
9. **Teacher feedback** — `tasmiq_api.py` writes to `feedback` table; portal's RecitationReview writes to `recitations.feedback` — two different places.

---

## SECTION 4 — Missing Tables ❌

| Table | Used By | Status |
|---|---|---|
| `assessments` | tasmiq_api.py (INSERT), tasmiq_api.py (SELECT with JOIN) | ❌ Missing |
| `notifications` | Mobile notification center | ❌ Missing |
| `achievements` | Achievement system | ❌ Missing |
| `activity_logs` | Audit trail | ❌ Missing |
| `student_progress` | Progress Screen (mobile) | ❌ Missing |
| `assignments` | TasmiqPrepScreen (SELECT assignments table) | ❌ Missing |

Tables in schema but columns mismatch actual DB:
- `users` — schema has `display_name`, actual DB has `full_name` + `password_hash`
- `recitations` — schema has `student_id`, mobile writes `studentId` (camelCase)
- `classes` — schema has `code`, mobile/portal uses `unique_code`

---

## SECTION 5 — Missing Relationships ❌

| Relationship | Issue |
|---|---|
| recitations → assessments | No `assessments` table — AI scores stored inline in recitations |
| recitations → feedback | Portal saves to recitations.feedback; API saves to feedback table — inconsistent |
| users → achievements | No junction table or achievements table |
| users → notifications | No notifications table |
| class_members vs class_enrollments | Mobile uses `class_members`, portal schema defines `class_enrollments` — same concept, two tables |
| join_requests | In actual DB but not in supabase_schema.sql |

---

## SECTION 6 — Missing API Integrations ❌

| Feature | Missing |
|---|---|
| Mobile Progress Screen | No API call — all hardcoded |
| Mobile Murajaah save | No INSERT after session completes |
| Mobile Achievement unlock | No INSERT/UPDATE for badges |
| Mobile hint tracking | No UPDATE on hint_count |
| tasmiq_api.py Supabase creds | Reads from env vars that are NOT set — falls back to placeholder "your-project.supabase.co" |

---

## SECTION 7 — Database Structure Improvements Needed

1. Standardise ALL column names to snake_case across schema and code
2. Add missing columns to `users`: `full_name`, `password_hash`, `streak_days`, `total_sessions`, `last_practice_date`, `progress_percentage`
3. Add `student_name` column alias handling (mobile writes it, schema has it, good)
4. Rename `class_enrollments` → keep both `class_enrollments` AND `class_members` as views or aliases
5. Add `unique_code` to classes table (mobile uses it, schema uses `code`)
6. Create proper `assessments` table separate from inline recitation fields

---

## SECTION 8 — Required SQL Scripts

See: `MASTER_SCHEMA_FIX.sql` (generated below)

---

## SECTION 9 — Required Frontend Fixes

### Teacher Portal
- [x] AuthContext — fixed to use full_name/display_name
- [ ] recitations queries — change all `recordedAt` → `recorded_at`, `studentId` → `student_id`
- [ ] Dashboard "4 new this week" — replace with real DB query
- [ ] mockData.js — delete or replace with DB calls

### Mobile App  
- [ ] Progress Screen — replace all hardcoded data with DB queries
- [ ] recitationService.js — fix camelCase → snake_case column names
- [ ] authService.js register — fix column names (displayName→full_name, streakDays→streak_days)
- [ ] MurajaahModeScreen — add INSERT on session complete
- [ ] Hint tracking — add hint_count column and update logic

---

## SECTION 10 — Required Backend Fixes

### tasmiq_api.py
- [ ] Set SUPABASE_URL and SUPABASE_KEY from actual .env values
- [ ] Fix column: `recitations.user_id` → `recitations.student_id`
- [ ] Create `assessments` table and fix that INSERT
- [ ] Fix `users.id` → `users.uid` throughout
