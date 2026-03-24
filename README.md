# Déjà View 🔐
### Shoulder-Surfing Resistant Three-Factor Authentication System
**HTU Jordan — Capstone Project (GP2) | Farouq Hassan, Tama Refaey, Abdelrahman Melhem**

---

## Overview

Déjà View is a browser-based MFA system that protects against shoulder-surfing and observation attacks. Instead of a typed password, authentication uses three local, non-observable factors:

| Factor | What it is | Library |
|--------|-----------|---------|
| **Secret image** | SHA-256 hash of a personal image file | `crypto.subtle` (browser built-in) |
| **Face biometric** | 128-float facial descriptor, verified locally | `@vladmandic/face-api` |
| **TOTP code** | Time-based one-time password | `otplib` |

The secret image is **never uploaded** — only its hash is stored. The face scan runs **entirely in the browser** — only the descriptor (128 numbers) is sent. No raw biometric data ever leaves the device.

---

## Project Structure

```
deja-view/
├── client/                  # React + Vite frontend
│   ├── public/
│   │   └── models/          # ← face-api.js model files go here
│   └── src/
│       ├── components/
│       │   ├── Alert.jsx
│       │   ├── ImagePicker.jsx
│       │   ├── StepIndicator.jsx
│       │   └── WebcamCapture.jsx
│       ├── hooks/
│       │   └── useAuth.jsx
│       ├── pages/
│       │   ├── LoginPage.jsx
│       │   ├── RegisterPage.jsx
│       │   └── DashboardPage.jsx
│       ├── utils/
│       │   ├── api.js           # All API calls
│       │   ├── faceDetection.js # face-api.js wrapper
│       │   └── imageHash.js     # SHA-256 in browser
│       ├── styles/
│       │   └── global.css
│       ├── App.jsx
│       └── main.jsx
│
├── server/                  # Node.js + Express backend
│   ├── db/
│   │   ├── database.js      # SQLite setup + schema
│   │   └── reset.js         # Dev: wipe the DB
│   ├── middleware/
│   │   └── auth.js          # JWT verify + rate limiter
│   ├── routes/
│   │   ├── register.js      # POST /api/register/*
│   │   ├── login.js         # POST /api/login/*
│   │   └── user.js          # GET /api/user/*
│   ├── index.js             # Express app entry
│   ├── .env.example         # ← copy to .env
│   └── package.json
│
├── shared/
│   └── constants.js         # Shared between client + server
│
└── package.json             # Root monorepo
```

---

## Quick Start

### 1. Clone and install

```bash
git clone <your-repo-url>
cd deja-view

# Install all workspaces
npm install --workspace=client
npm install --workspace=server
npm install  # root (concurrently)
```

### 2. Configure server

```bash
cd server
cp .env.example .env
# Edit .env — at minimum change JWT_SECRET to a long random string
```

### 3. Download face-api.js models

```bash
# From the project root:
mkdir -p client/public/models
cd client/public/models

# Download these 6 files from:
# https://github.com/vladmandic/face-api/tree/master/model
#
# Required:
#   tiny_face_detector_model-weights_manifest.json
#   tiny_face_detector_model-shard1
#   face_landmark_68_model-weights_manifest.json
#   face_landmark_68_model-shard1
#   face_recognition_model-weights_manifest.json
#   face_recognition_model-shard1
```

Or use this one-liner (requires curl):
```bash
BASE="https://raw.githubusercontent.com/vladmandic/face-api/master/model"
for f in \
  tiny_face_detector_model-weights_manifest.json \
  tiny_face_detector_model-shard1 \
  face_landmark_68_model-weights_manifest.json \
  face_landmark_68_model-shard1 \
  face_recognition_model-weights_manifest.json \
  face_recognition_model-shard1; do
  curl -sL "$BASE/$f" -o "$f"
done
```

### 4. Run (dev)

```bash
# From project root — starts both server (3001) and client (5173):
npm run dev
```

Or separately:
```bash
# Terminal 1:
cd server && npm run dev

# Terminal 2:
cd client && npm run dev
```

Open http://localhost:5173

---

## API Reference

### Registration

| Endpoint | Method | Body | Description |
|----------|--------|------|-------------|
| `/api/register/init` | POST | `{username, password, imageHash}` | Create account, get TOTP QR |
| `/api/register/verify-totp` | POST | `{userId, totpCode}` | Confirm TOTP enrollment |
| `/api/register/save-face` | POST | `{userId, faceDescriptor[]}` | Store face descriptor |

### Login (sequential — each step returns a partial JWT)

| Endpoint | Method | Auth | Body | Description |
|----------|--------|------|------|-------------|
| `/api/login/verify-image` | POST | — | `{username, imageHash}` | Factor 1 — returns partialToken |
| `/api/login/verify-face` | POST | `partialToken` | `{faceDescriptor[]}` | Factor 2 — advances token |
| `/api/login/verify-totp` | POST | `partialToken` | `{totpCode}` | Factor 3 — returns sessionToken |

### Protected routes

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/user/me` | `sessionToken` | Current user profile + enrollment status |
| `GET /api/user/login-history` | `sessionToken` | Last 20 login attempts |

---

## Security Design

### Why image hash?
- The image acts as a "something you have" factor — a possession-based key
- A shoulder surfer watching the screen cannot determine what image was used
- The SHA-256 hash is computed client-side — the file is never transmitted

### Why face-api.js in-browser?
- The 128-float descriptor is computed from the live webcam frame locally
- No biometric photo or video is ever sent to the server
- The descriptor alone cannot reconstruct a face image

### Why three factors together?
An attacker would need to:
1. Know the exact image file (not guessable, not visible on screen)
2. Look exactly like the registered user (biometric)
3. Have the registered authenticator device (possession)

### Partial JWT chain
Login uses a step-locked JWT chain. Each factor check advances the token to the next `step` claim. The final TOTP step issues a full session token. Partial tokens expire in 5 minutes — a user can't skip steps.

---

## Development Notes

### Reset the database
```bash
cd server && npm run db:reset
```

### Face match threshold
In `shared/constants.js`:
```js
export const FACE_MATCH_THRESHOLD = 0.5;
// 0.4 = strict (fewer false accepts, more false rejects)
// 0.6 = lenient (more false accepts, fewer false rejects)
```

### Running tests (TODO — Phase 2 task 34)
```bash
# Planned: Jest for server routes, Playwright for E2E
npm test
```

---

## Task Assignment (GP2)

| Task | Owner | Status |
|------|-------|--------|
| Auth module — image hash + face binding | Farouq + Abdelrahman | In progress |
| Backend REST API | Abdelrahman | ✅ Scaffolded |
| MFA integration (TOTP + factor chaining) | Tama | ✅ Scaffolded |
| Frontend UI | Farouq | ✅ Scaffolded |
| System integration | Everyone | Mar 27 → |
| Functional testing | Everyone | Apr 6 → |
| Security testing | Everyone | Apr 13 → |

---

## License
Academic project — HTU Jordan, 2026.
"# deja-view" 
