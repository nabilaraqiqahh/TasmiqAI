# TasmiqAI — Phase 2 Deployment Checklist

Use this checklist to track each step of the server deployment.
Reference the full instructions in `SERVER_DEPLOYMENT_GUIDE.md`.

## Server Access
- [ ] Server created (Ubuntu 22.04 LTS, $6/month DigitalOcean droplet)
- [ ] Server public IP noted: ___________________
- [ ] SSH access works: `ssh root@<ip>`

## Server Setup
- [ ] System updated (`apt update && apt upgrade -y`)
- [ ] Required packages installed (`python3.12`, `python3.12-venv`, `ffmpeg`, `nginx`, `git`, `build-essential`, `libsndfile1`)
- [ ] Python version confirmed: `python3.12 --version` → Python 3.12.x
- [ ] FFmpeg confirmed: `ffmpeg -version` → shows version
- [ ] Nginx confirmed: `nginx -v` → shows version

## User and Directory
- [ ] `tasmiqai` Linux user created (`useradd -m -s /bin/bash tasmiqai`)
- [ ] `/opt/tasmiqai` directory created and owned by `tasmiqai`

## Code Deployment
- [ ] Repository cloned to `/opt/tasmiqai` (`git clone ...`)
- [ ] Correct branch checked out (`git checkout TasmiqAI-20/6`)
- [ ] `tasmiq_api.py` is present in `/opt/tasmiqai`
- [ ] `requirements.txt` is present in `/opt/tasmiqai`
- [ ] Quran data present: `ls data/quran/source/surah/ | wc -l` → 115

## Python Environment
- [ ] Virtual environment created (`python3.12 -m venv venv`)
- [ ] Virtual environment activated (`source venv/bin/activate`)
- [ ] Dependencies installed (`pip install -r requirements.txt`)
- [ ] Key packages verified (`pip show fastapi bcrypt python-jose librosa supabase`)

## Environment Configuration
- [ ] `.env` file created at `/opt/tasmiqai/.env`
- [ ] `GEMINI_API_KEY` set in `.env`
- [ ] `SUPABASE_URL` set in `.env`
- [ ] `SUPABASE_KEY` set in `.env`
- [ ] `JWT_SECRET` set in `.env` (new random secret — not same as local dev)
- [ ] `.env` file permissions set to 600 (`chmod 600 .env`)
- [ ] `.env` is NOT committed to Git (`git status` does not show `.env`)

## Local Server Test (before Nginx)
- [ ] FastAPI starts manually: `uvicorn tasmiq_api:app --host 127.0.0.1 --port 8001`
- [ ] Health check passes from inside server: `curl http://127.0.0.1:8001/health`
- [ ] Response shows `"status": "ok"`
- [ ] Response shows `"supabase_connected": true`
- [ ] Response shows `"gemini_ready": true`
- [ ] Response shows `"ffmpeg_available": true`
- [ ] Response shows `"dataset_loaded": true`
- [ ] Response shows `"dataset_surahs": 114`
- [ ] Manual server stopped (Ctrl+C)

## Systemd Service
- [ ] Service file copied to `/etc/systemd/system/tasmiqai.service`
  - Source: `deploy/tasmiqai.service` in the repository
- [ ] `systemctl daemon-reload` run
- [ ] `systemctl start tasmiqai` succeeds
- [ ] `systemctl status tasmiqai` shows `active (running)`
- [ ] `systemctl enable tasmiqai` run (auto-start on reboot)
- [ ] Logs look clean: `journalctl -u tasmiqai -n 50`

## Reboot Test
- [ ] Server rebooted: `reboot`
- [ ] After reboot: `systemctl status tasmiqai` still shows `active (running)`
- [ ] Backend survives server restart without manual intervention

## Nginx Reverse Proxy
- [ ] Nginx config copied to `/etc/nginx/sites-available/tasmiqai`
  - Source: `deploy/nginx-tasmiqai.conf` in the repository
- [ ] Symlink created in sites-enabled
- [ ] Default Nginx site removed from sites-enabled
- [ ] `nginx -t` shows: `configuration file test is successful`
- [ ] `systemctl restart nginx` succeeds
- [ ] `systemctl enable nginx` run

## Firewall
- [ ] UFW installed and configured
- [ ] Port 22 (SSH) allowed
- [ ] Port 80 (HTTP) allowed
- [ ] Port 443 (HTTPS, for Phase 3) allowed
- [ ] Port 8001 is NOT publicly accessible (internal only)
- [ ] `ufw enable` run
- [ ] `ufw status` shows correct rules

## Public API Test
- [ ] Root endpoint: `curl http://<ip>/` → `{"message": "TasmiqAI API is running!"}`
- [ ] Health endpoint: `curl http://<ip>/health` → `{"status": "ok", ...}`
- [ ] Supabase connected (from health response)
- [ ] Gemini ready (from health response)
- [ ] FFmpeg available (from health response)
- [ ] No secrets exposed in any API response

## Functional Tests (from local machine)
- [ ] Audio upload test: `curl -X POST http://<ip>/api/debug-audio -F "audio=@test.wav"`
- [ ] AI analysis works (submit a real recording through the mobile app)
- [ ] Login works through the mobile app (bcrypt password verified)
- [ ] Supabase data is saved correctly

## Security Checks
- [ ] FastAPI running as `tasmiqai` user (not root): `ps aux | grep uvicorn`
- [ ] Port 8001 not publicly accessible: `nmap -p 8001 <ip>` → filtered/closed
- [ ] `/api/auth/debug-user` endpoint does NOT exist (returns 404)
- [ ] `.env` file not accessible from web (`curl http://<ip>/.env` → 404)
- [ ] No secrets visible in `curl http://<ip>/health` response

## Phase 2 Complete
- [ ] All checks above are ticked
- [ ] API works at `http://<server-ip>/health`
- [ ] Ready to proceed to Phase 3 (domain + SSL)

---
*Next step after Phase 2: Update Nginx server_name to `api.tasmiqai.com`, add Cloudflare, configure SSL with Certbot.*
