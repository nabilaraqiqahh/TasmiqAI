# TasmiqAI — Server Deployment Guide
## Phase 2: Deploy to Cloud Server (HTTP via Public IP)

> **Goal**: Get the FastAPI backend running on a public Linux server and
> reachable at `http://<your-server-ip>/health` before configuring the domain.
>
> DNS, SSL, and `api.tasmiqai.com` are covered in Phase 3.

---

## Recommended Server Specification

| Item | Minimum | Recommended |
|------|---------|-------------|
| Provider | DigitalOcean, Vultr, Hetzner | DigitalOcean |
| Plan | Basic — $6/month | Basic — $6/month |
| CPU | 1 vCPU | 1–2 vCPU |
| RAM | 1 GB | 2 GB |
| Storage | 25 GB SSD | 25 GB SSD |
| OS | **Ubuntu 22.04 LTS** | Ubuntu 22.04 LTS |
| Region | Singapore / Southeast Asia | Singapore |
| GPU | Not required | Not required |

> DigitalOcean droplet: Ubuntu 22.04 x64, Basic, $6/month (1 vCPU, 1GB RAM).
> Create at: https://cloud.digitalocean.com

---

## Step 1 — Create the Server

1. Sign up at https://cloud.digitalocean.com
2. Click **Create > Droplet**
3. Choose:
   - Image: **Ubuntu 22.04 (LTS) x64**
   - Plan: **Basic → Regular → $6/month**
   - Region: **Singapore** (closest to Malaysia)
   - Authentication: **SSH Key** (recommended) or Password
4. Click **Create Droplet**
5. Note the **public IP address** (e.g. `123.45.67.89`)

---

## Step 2 — Connect via SSH

From your Windows machine (use PowerShell or Windows Terminal):

```bash
ssh root@123.45.67.89
```

If you used a password during creation, enter it when prompted.

---

## Step 3 — Update the System

```bash
apt update && apt upgrade -y
```

---

## Step 4 — Install Required Packages

```bash
apt install -y \
  python3.12 \
  python3.12-venv \
  python3.12-dev \
  python3-pip \
  ffmpeg \
  nginx \
  git \
  curl \
  build-essential \
  libsndfile1
```

Verify installations:

```bash
python3.12 --version    # Should show Python 3.12.x
ffmpeg -version         # Should show ffmpeg version info
nginx -v                # Should show nginx version
```

---

## Step 5 — Create the Dedicated Application User

**Never run the application as root.**

```bash
# Create user 'tasmiqai' with no login shell (security best practice)
useradd -m -s /bin/bash tasmiqai

# Verify the user was created
id tasmiqai
```

---

## Step 6 — Create Application Directory

```bash
# Create the app directory and set ownership
mkdir -p /opt/tasmiqai
chown tasmiqai:tasmiqai /opt/tasmiqai
```

---

## Step 7 — Clone the Repository

```bash
# Switch to the tasmiqai user
su - tasmiqai

# Clone the repository into /opt/tasmiqai
git clone https://github.com/nabilaraqiqahh/TasmiqAI.git /opt/tasmiqai

# Verify the clone worked
ls /opt/tasmiqai
# Should show: tasmiq_api.py, tasmiq_app.py, requirements.txt, data/, etc.
```

---

## Step 8 — Create the Python Virtual Environment

```bash
# Still as tasmiqai user, inside the project directory
cd /opt/tasmiqai

# Create virtual environment using Python 3.12
python3.12 -m venv venv

# Activate the virtual environment
source venv/bin/activate

# Verify you are in the venv
which python   # Should show /opt/tasmiqai/venv/bin/python
python --version  # Should show Python 3.12.x
```

---

## Step 9 — Install Python Dependencies

```bash
# Make sure venv is activated (source venv/bin/activate)

# Upgrade pip first
pip install --upgrade pip

# Install all required packages
pip install -r requirements.txt
```

This will install: FastAPI, Uvicorn, bcrypt, python-jose, Supabase, librosa,
soundfile, numpy, scipy, google-genai, and other required packages.

> Expected time: 2–5 minutes on a standard droplet.

Verify key packages:
```bash
pip show fastapi bcrypt python-jose librosa supabase
```

---

## Step 10 — Verify FFmpeg is Available

```bash
which ffmpeg         # Should return /usr/bin/ffmpeg
ffmpeg -version      # Should show version details
```

The application automatically detects system FFmpeg on Linux.
The bundled Windows `ffmpeg.exe` is ignored on Linux.

---

## Step 11 — Create the Production .env File

**Do NOT copy your local .env file.** Create a fresh one on the server.

```bash
# Still as tasmiqai user
cd /opt/tasmiqai

# Create the .env file (never commit this file to git)
nano .env
```

Paste the following and fill in your actual values:

```
# TasmiqAI Production Environment
GEMINI_API_KEY=your_actual_gemini_api_key_here
SUPABASE_URL=https://mrxgwwhbcskcjkgtnrtd.supabase.co
SUPABASE_KEY=your_actual_supabase_anon_key_here
JWT_SECRET=generate_a_new_random_hex_string_here
JWT_EXPIRE_HOURS=72
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
QURAN_DATA_DIR=
API_URL=http://localhost:8001
```

> Generate a JWT secret: `python3.12 -c "import secrets; print(secrets.token_hex(32))"`

Save and close: **Ctrl+O**, Enter, **Ctrl+X**

Set strict file permissions (only owner can read):
```bash
chmod 600 /opt/tasmiqai/.env
```

---

## Step 12 — Verify Quran Data is Available

```bash
ls /opt/tasmiqai/data/quran/source/surah/ | wc -l
# Should show: 115
```

The 115 Quran JSON files are bundled in the repository under `data/quran/source/surah/`.
No additional download is needed.

---

## Step 13 — Test FastAPI Locally on the Server

Before configuring Nginx, confirm the backend starts correctly:

```bash
# As tasmiqai user, activate venv
cd /opt/tasmiqai
source venv/bin/activate

# Start the server manually (test only — not for production)
uvicorn tasmiq_api:app --host 127.0.0.1 --port 8001
```

You should see output like:
```
INFO:     Started server process [xxxxx]
INFO:     Uvicorn running on http://127.0.0.1:8001
INFO:     Application startup complete.
```

Open a **second SSH session** and test from inside the server:
```bash
curl http://127.0.0.1:8001/health
```

Expected response:
```json
{
  "status": "ok",
  "supabase_connected": true,
  "dataset_loaded": true,
  "dataset_surahs": 114,
  "gemini_ready": true,
  "ffmpeg_available": true
}
```

If this works, stop the server with **Ctrl+C** and proceed.

---

## Step 14 — Configure systemd Service

Exit back to root user:
```bash
exit   # exit from tasmiqai user back to root
```

Create the systemd service file:
```bash
nano /etc/systemd/system/tasmiqai.service
```

Paste this exact content:

```ini
[Unit]
Description=TasmiqAI FastAPI Backend
Documentation=https://github.com/nabilaraqiqahh/TasmiqAI
After=network.target
Wants=network-online.target

[Service]
Type=exec
User=tasmiqai
Group=tasmiqai
WorkingDirectory=/opt/tasmiqai
EnvironmentFile=/opt/tasmiqai/.env
ExecStart=/opt/tasmiqai/venv/bin/uvicorn tasmiq_api:app \
    --host 127.0.0.1 \
    --port 8001 \
    --workers 2 \
    --log-level info \
    --access-log
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=tasmiqai
# Security hardening
NoNewPrivileges=yes
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
```

Save: **Ctrl+O**, Enter, **Ctrl+X**

---

## Step 15 — Start and Enable the Service

```bash
# Reload systemd to pick up the new service file
systemctl daemon-reload

# Start the service
systemctl start tasmiqai

# Enable auto-start on server reboot
systemctl enable tasmiqai

# Check the status
systemctl status tasmiqai
```

Expected output includes:
```
● tasmiqai.service - TasmiqAI FastAPI Backend
     Loaded: loaded (/etc/systemd/system/tasmiqai.service; enabled)
     Active: active (running) since ...
```

---

## Step 16 — Check Logs

```bash
# Real-time logs (Ctrl+C to exit)
journalctl -u tasmiqai -f

# Last 50 lines
journalctl -u tasmiqai -n 50

# Logs since last boot
journalctl -u tasmiqai -b
```

---

## Step 17 — Configure Nginx as Reverse Proxy

Create the Nginx site configuration:
```bash
nano /etc/nginx/sites-available/tasmiqai
```

Paste this content:

```nginx
server {
    listen 80;
    # Phase 2: Use server IP only. Phase 3: change to api.tasmiqai.com
    server_name _;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Allow audio file uploads up to 50MB
    client_max_body_size 50M;

    # Increase timeout for Gemini AI calls (can take 10-20s)
    proxy_read_timeout 120s;
    proxy_connect_timeout 10s;
    proxy_send_timeout 30s;

    location / {
        proxy_pass         http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_buffering    off;
    }
}
```

Enable the site and disable the default:
```bash
# Enable our site
ln -s /etc/nginx/sites-available/tasmiqai /etc/nginx/sites-enabled/

# Remove the default placeholder
rm -f /etc/nginx/sites-enabled/default

# Test configuration syntax
nginx -t
```

Expected: `nginx: configuration file /etc/nginx/nginx.conf test is successful`

Restart Nginx:
```bash
systemctl restart nginx
systemctl enable nginx
```

---

## Step 18 — Configure Firewall

```bash
# Install ufw if not present
apt install -y ufw

# Allow SSH (important — do this BEFORE enabling the firewall)
ufw allow 22/tcp

# Allow HTTP
ufw allow 80/tcp

# Allow HTTPS (for Phase 3 when you add SSL)
ufw allow 443/tcp

# Enable the firewall
ufw enable

# Verify rules
ufw status
```

> Port 8001 is NOT opened. It stays internal (Nginx proxies to it).

---

## Step 19 — Test the API Through the Public IP

From your **local Windows machine** (not the server), run:

```bash
curl http://123.45.67.89/health
```

Or open in a browser: `http://123.45.67.89/health`

Expected response:
```json
{
  "status": "ok",
  "supabase_connected": true,
  "dataset_loaded": true,
  "dataset_surahs": 114,
  "gemini_ready": true,
  "ffmpeg_available": true,
  "ffmpeg_path": "/usr/bin/ffmpeg",
  "engine": "Gemini Flash"
}
```

Also test the root endpoint:
```bash
curl http://123.45.67.89/
```

Expected:
```json
{"message": "TasmiqAI API is running!", "status": "online", "version": "2.0"}
```

---

## Step 20 — Test a Real Audio Upload (Optional at this stage)

From your local machine, test the `/api/debug-audio` endpoint with a small WAV file:

```bash
curl -X POST http://123.45.67.89/api/debug-audio \
  -F "audio=@test.wav"
```

Expected response confirms FFmpeg and audio loading works.

---

## Restarting the Service After Code Updates

When you push new code to GitHub:

```bash
# SSH into server as root
ssh root@123.45.67.89

# Pull latest code
su - tasmiqai -c "cd /opt/tasmiqai && git pull origin TasmiqAI-20/6"

# Restart the service
systemctl restart tasmiqai

# Verify it's running
systemctl status tasmiqai
```

---

## Useful Commands Reference

```bash
# Service management
systemctl status tasmiqai     # Check if running
systemctl restart tasmiqai    # Restart after code change
systemctl stop tasmiqai       # Stop the service
systemctl start tasmiqai      # Start the service

# Logs
journalctl -u tasmiqai -f     # Live logs
journalctl -u tasmiqai -n 100 # Last 100 lines

# Nginx
nginx -t                       # Test config syntax
systemctl reload nginx         # Reload config without downtime
systemctl restart nginx        # Full restart

# Application
curl http://127.0.0.1:8001/health   # Test from inside server
curl http://123.45.67.89/health     # Test through Nginx (public)
```

---

## What Comes Next (Phase 3)

Once this guide is complete and the API works at `http://<server-ip>/health`:

1. Register the domain `tasmiqai.com`
2. Add `api` subdomain A record → `<server-ip>`
3. Add Cloudflare (free SSL)
4. Update Nginx `server_name` to `api.tasmiqai.com`
5. Run Certbot for HTTPS
6. Update mobile app `api.js` to point to `https://api.tasmiqai.com`
7. Update `ALLOWED_ORIGINS` in server `.env`

---

*Guide version: Phase 2 | Branch: TasmiqAI-20/6*
