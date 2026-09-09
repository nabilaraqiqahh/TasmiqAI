# TasmiqAI — Netlify Deployment Guide

You will deploy **two separate Netlify sites** from the same GitHub repository.

---

## Prerequisites

1. Push your project to GitHub (if not already done):
   ```
   git add .
   git commit -m "feat: production build config"
   git push origin main
   ```

2. Go to https://netlify.com and sign in.

---

## SITE 1 — Teacher Portal

### Deploy steps

1. Click **"Add new site"** → **"Import an existing project"**
2. Choose **GitHub** → select your repo (`TasmiqAI` or whatever it's named)
3. Fill in the build settings:

   | Setting | Value |
   |---------|-------|
   | Base directory | `tasmiq-teacher-portal` |
   | Build command | `npm run build` |
   | Publish directory | `tasmiq-teacher-portal/dist` |

4. Click **"Add environment variables"** and add:

   | Key | Value |
   |-----|-------|
   | `VITE_SUPABASE_URL` | `https://mrxgwwhbcskcjkgtnrtd.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (your full anon key) |
   | `VITE_API_URL` | `https://api.tasmiqai.com` |

5. Click **Deploy site**
6. Rename the site to something like `tasmiq-portal` (Site settings → General → Site name)

> The `netlify.toml` file in `tasmiq-teacher-portal/` handles SPA routing automatically.

---

## SITE 2 — Student Mobile Web App

### Deploy steps

1. Click **"Add new site"** → **"Import an existing project"**
2. Choose the same GitHub repo
3. Fill in the build settings:

   | Setting | Value |
   |---------|-------|
   | Base directory | `tasmiq-mobile` |
   | Build command | `npx expo export --platform web` |
   | Publish directory | `tasmiq-mobile/dist` |

4. Click **"Add environment variables"** and add:

   | Key | Value |
   |-----|-------|
   | `EXPO_PUBLIC_API_URL` | `https://api.tasmiqai.com` |
   | `NODE_VERSION` | `20` |

5. Click **Deploy site**
6. Rename the site to something like `tasmiq-student`

> The `netlify.toml` file in `tasmiq-mobile/` handles SPA routing automatically.

---

## SITE 3 (Optional) — Backend API

The FastAPI backend (`tasmiq_api.py`) **cannot run on Netlify** — it requires Python, librosa, and a persistent server process.

Options for the backend:
- **Railway** (recommended, free tier): https://railway.app
- **Render**: https://render.com
- **Google Cloud Run**
- Your own VPS/server

See `deploy/tasmiqai.service` for the systemd config if using a Linux server.

---

## After Deployment — Update CORS

Once you have your Netlify URLs (e.g. `https://tasmiq-portal.netlify.app`), update the backend `.env`:

```
ALLOWED_ORIGINS=https://tasmiq-portal.netlify.app,https://tasmiq-student.netlify.app
```

Then restart the backend.

---

## Update Supabase Auth (if using Supabase Auth)

In Supabase Dashboard → Authentication → URL Configuration, add your Netlify URLs:
- Site URL: `https://tasmiq-portal.netlify.app`
- Redirect URLs: `https://tasmiq-portal.netlify.app/**`

---

## Quick Checklist

- [ ] Code pushed to GitHub
- [ ] Teacher portal deployed to Netlify
- [ ] Student app deployed to Netlify  
- [ ] Environment variables set in both Netlify sites
- [ ] Backend CORS updated with Netlify URLs
- [ ] Test login on both sites
- [ ] Test AI recording from Netlify (ensure backend reachable)
