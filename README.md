# 🎣 PhishSim — Phishing Campaign Simulation Platform

> Controlled GoPhish-style platform for security awareness training.
> Tracks click rates, credential submissions, and auto-generates AI security reports.

---

## ⚠️ Legal Disclaimer

This tool is for **authorized security awareness training only**.  
Always obtain **written permission** before running simulations against real users.  
Never use against systems/users you don't have explicit authorization for.

---

## 🏗️ Architecture

```
phishsim/
├── server/          Express.js backend
│   ├── index.js     API + tracking server
│   ├── phishsim.db  SQLite database (auto-created)
│   └── .env         Config (copy from .env.example)
├── client/          React + Vite frontend
│   └── src/
│       ├── App.jsx  Main UI
│       └── api.js   API client
└── package.json     Root scripts
```

**Backend** (Express.js + SQLite):
- REST API for campaign management
- Real tracking tokens per target (UUID)
- Click & credential submission tracking
- Email sending via Nodemailer (real SMTP or Ethereal test)
- Credential harvest landing page served by server

**Frontend** (React + Vite):
- Campaign builder (templates, custom CSV targets)
- Live dashboard with 3-second polling
- Simulation sandbox (step into any target's inbox)
- AI report generation via Claude API

---

## 🚀 Quick Start

### 1. Install dependencies

```bash
# Install root concurrently
npm install

# Install server + client deps
npm run install:all
```

### 2. Configure environment

```bash
cd server
cp .env.example .env
# Edit .env — at minimum set BASE_URL for real email tracking
```

### 3. Run (dev mode)

```bash
# From root — starts both server (port 3001) and client (port 5173)
npm run dev
```

Open **http://localhost:5173**

---

## 📧 Email Configuration

### Option A: Ethereal (test, no real email sent)
Leave `.env` SMTP fields empty. The `/send` API response includes a **preview URL** to view the email in browser.

### Option B: Mailtrap (recommended for testing)
```
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=<from mailtrap dashboard>
SMTP_PASS=<from mailtrap dashboard>
```

### Option C: Gmail
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password   # Google App Password, not real password
```

---

## 🔌 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/campaigns` | List all campaigns |
| POST | `/api/campaigns` | Create campaign |
| GET | `/api/campaigns/:id` | Get campaign + targets |
| DELETE | `/api/campaigns/:id` | Delete campaign |
| POST | `/api/campaigns/:id/send` | Send phishing emails |
| GET | `/api/campaigns/:id/stats` | Click/submit stats |
| GET | `/api/campaigns/:id/events` | Event log |
| POST | `/api/campaigns/:id/simulate-click` | Sandbox: record click |
| POST | `/api/campaigns/:id/simulate-submit` | Sandbox: record submission |
| GET | `/track/:token` | Tracking link (serves harvest page) |
| POST | `/track/:token/submit` | Record credential submission |

---

## 🚢 Deployment (Render + Vercel)

### Backend → Render
1. Push to GitHub
2. New Web Service → `server/` directory
3. Build: `npm install`
4. Start: `node index.js`
5. Set env vars: `PORT`, `BASE_URL` (your Render URL), SMTP config

### Frontend → Vercel
1. New project → `client/` directory
2. Framework: Vite
3. Set `VITE_API_URL` if not using proxy (update `api.js` BASE)

---

## 🔒 Security Notes

- Credential submissions are tracked (event logged) but **actual passwords are never stored**
- All tracking uses opaque UUID tokens, not PII in URLs  
- Run only against `@testorg.local` or lab domains by default
- Database is local SQLite — use PostgreSQL for production

---

## 📋 Features

- [x] Campaign creation with 4 phishing templates (urgency, financial, authority, curiosity)
- [x] Custom CSV target import
- [x] Real email sending (Nodemailer + SMTP/Ethereal)
- [x] Unique tracking token per target
- [x] Click tracking (timestamp, IP, user agent)
- [x] Credential harvest landing page
- [x] Credential submission tracking
- [x] Live dashboard (3s polling)
- [x] Department vulnerability breakdown
- [x] Simulation sandbox (no email needed)
- [x] AI-generated security awareness reports (Claude API)
- [x] Export report as .txt
- [x] SQLite persistence
