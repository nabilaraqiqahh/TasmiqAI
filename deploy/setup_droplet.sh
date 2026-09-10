#!/bin/bash
# ==============================================================================
#  TasmiqAI - DigitalOcean Droplet Automated Setup Script
#  Target: Ubuntu 22.04 / 24.04 (Droplet IP: 159.223.39.224)
# ==============================================================================
set -e

echo "=== [1/7] Updating system and installing dependencies ==="
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y python3 python3-pip python3-venv ffmpeg nginx git curl build-essential libsndfile1

echo "=== [2/7] Creating application user and folder ==="
if ! id "tasmiqai" &>/dev/null; then
    useradd -m -s /bin/bash tasmiqai
fi

mkdir -p /opt/tasmiqai
chown -R tasmiqai:tasmiqai /opt/tasmiqai

echo "=== [3/7] Cloning or updating repository ==="
if [ -d "/opt/tasmiqai/.git" ]; then
    echo "Repository exists. Pulling latest code..."
    cd /opt/tasmiqai
    git fetch origin
    git checkout main
    git pull origin main
else
    echo "Cloning repository..."
    git clone https://github.com/nabilaraqiqahh/TasmiqAI.git /opt/tasmiqai
    cd /opt/tasmiqai
    git checkout main
fi
chown -R tasmiqai:tasmiqai /opt/tasmiqai

echo "=== [4/7] Setting up Python virtual environment ==="
cd /opt/tasmiqai
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

echo "=== [5/7] Configuring Nginx ==="
# Remove default nginx welcome site
rm -f /etc/nginx/sites-enabled/default

# Copy nginx config
cat << 'EOF' > /etc/nginx/sites-available/tasmiqai
server {
    listen 80;
    server_name _;

    client_max_body_size 50M;

    proxy_read_timeout    120s;
    proxy_connect_timeout 10s;
    proxy_send_timeout    30s;

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
EOF

ln -sf /etc/nginx/sites-available/tasmiqai /etc/nginx/sites-enabled/tasmiqai
nginx -t
systemctl restart nginx

echo "=== [6/7] Configuring systemd service ==="
cat << 'EOF' > /etc/systemd/system/tasmiqai.service
[Unit]
Description=TasmiqAI FastAPI Backend
Documentation=https://github.com/nabilaraqiqahh/TasmiqAI
After=network.target

[Service]
Type=exec
User=tasmiqai
Group=tasmiqai
WorkingDirectory=/opt/tasmiqai
EnvironmentFile=/opt/tasmiqai/.env
ExecStart=/opt/tasmiqai/venv/bin/uvicorn tasmiq_api:app --host 127.0.0.1 --port 8001 --workers 2
Restart=always
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload

echo "=== [7/7] Checking .env configuration ==="
if [ ! -f "/opt/tasmiqai/.env" ]; then
    echo "WARNING: /opt/tasmiqai/.env not found! Creating template..."
    cat << 'EOF' > /opt/tasmiqai/.env
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
SUPABASE_URL=https://mrxgwwhbcskcjkgtnrtd.supabase.co
SUPABASE_KEY=YOUR_SUPABASE_SERVICE_OR_ANON_KEY
JWT_SECRET=tasmiqai_secret_super_key_2026_production
JWT_EXPIRE_HOURS=72
ALLOWED_ORIGINS=*
API_URL=http://127.0.0.1:8001
EOF
    chmod 600 /opt/tasmiqai/.env
    chown tasmiqai:tasmiqai /opt/tasmiqai/.env
    echo "Created template at /opt/tasmiqai/.env - Please update with your actual GEMINI_API_KEY and SUPABASE_KEY!"
fi

systemctl enable tasmiqai
systemctl restart tasmiqai

echo ""
echo "=========================================================="
echo " Setup complete! Testing health endpoint..."
sleep 3
curl -s http://127.0.0.1:8001/health || echo "FastAPI is starting up..."
echo ""
echo "You can check service status with: systemctl status tasmiqai"
echo "You can view live logs with: journalctl -u tasmiqai -f"
echo "=========================================================="
