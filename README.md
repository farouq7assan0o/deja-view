# Deja View
### Shoulder-Surfing Resistant Three-Factor Authentication System
**HTU Jordan -- Capstone Project (GP2) | Farouq Hassan, Tama Refaey, Abdelrahman Melhem**

---

## Overview

Deja View is a browser-based MFA system that protects against shoulder-surfing and observation attacks. Instead of a typed password, authentication uses three local, non-observable factors:

| Factor | What it is | Library |
|--------|-----------|---------|
| **Secret image** | SHA-256 hash of a personal image file | `crypto.subtle` (browser built-in) |
| **Face biometric** | 128-float facial descriptor, verified locally | `@vladmandic/face-api` |
| **Phone passkey** *(optional)* | WebAuthn / FIDO2 device biometric (Face ID, Touch ID, fingerprint) | `@simplewebauthn/browser` + `@simplewebauthn/server` |
| **TOTP code** | Time-based one-time password | `otplib` |

The secret image is **never uploaded** -- only its hash is stored. The face scan runs **entirely in the browser** -- only the descriptor (128 numbers) is sent. No raw biometric data ever leaves the device.

Users can optionally register a **phone passkey** during registration. At login, they choose between the webcam face scan or the phone passkey for the biometric step. This makes mobile login seamless using the device's native biometrics.

---

## Registration Flow

```
Step 1: Account + Live Secret Photo
  |-- Enter username + password
  |-- Take a live photo via webcam (SHA-256 hash computed and sent, photo stays on device)
  |-- Server creates account, returns TOTP QR code
  v
Step 2: Face Scan Enrollment
  |-- Webcam captures face with liveness detection (forward-facing + head turn)
  |-- 128-float face descriptor extracted in-browser and stored on server
  v
Step 3: Authenticator App (TOTP)
  |-- Scan QR code with Google Authenticator / Authy
  |-- Enter 6-digit code to confirm enrollment
  v
Step 4: Phone Passkey (OPTIONAL)
  |-- If browser supports WebAuthn, option to register Face ID / Touch ID / fingerprint
  |-- User can skip this step
  |-- Done -- redirect to login
```

## Login Flow

```
Step 1: Photo Key
  |-- Enter username
  |-- Photo hash auto-loaded from device (or upload original photo on a new device)
  |-- Server verifies hash, returns partial JWT
  v
Step 2: Biometric (choose one)
  |-- Option A: Webcam Face Scan (liveness detection + descriptor match)
  |-- Option B: Phone Passkey (Face ID / Touch ID / fingerprint) -- if enrolled
  |-- Server verifies, advances partial JWT
  v
Step 3: Authenticator Code
  |-- Enter 6-digit TOTP from authenticator app
  |-- Server issues full session JWT (2-hour expiry)
  |-- Redirect to dashboard
```

---

## Security Design

### Three independent factors
An attacker would need to:
1. **Have** the exact image file (not guessable, not visible on screen)
2. **Be** the registered user (face biometric or device biometric)
3. **Possess** the registered authenticator device (TOTP)

### Privacy by design
- Image hash computed client-side -- the file is never transmitted
- Face descriptor computed in-browser -- no biometric photo or video is sent
- The 128-float descriptor alone cannot reconstruct a face image
- Passkey private key never leaves the user's device

### Partial JWT chain
Login uses a step-locked JWT chain. Each factor check advances the token to the next `step` claim (`image_verified` -> `face_verified` -> full session). Partial tokens expire in 5 minutes. Steps cannot be skipped or reordered.

### Liveness detection
The webcam face scan includes:
- **Forward-facing validation**: eye symmetry ratio, both eyes visible and open, nose between eyes
- **Head turn challenge**: user must turn head slightly after forward-facing is confirmed
- **Score threshold**: face detection confidence must be >= 0.85
- Prevents spoofing with static photos or screens

### Rate limiting and replay prevention
- Image verify: 10 attempts per 5 minutes
- TOTP verify: 5 attempts per 15 minutes
- TOTP replay prevention: same code blocked for 90 seconds
- WebAuthn counter tracking prevents credential replay
- Constant-time hash comparison prevents timing attacks

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, React Router 6, Vite |
| Face Detection | @vladmandic/face-api (TinyFaceDetector + 68-point landmarks + recognition net) |
| Passkeys | @simplewebauthn/browser + @simplewebauthn/server (WebAuthn / FIDO2) |
| Backend | Node.js, Express |
| Database | SQLite via better-sqlite3 (WAL mode) |
| Auth | JWT (jsonwebtoken), bcryptjs (12 rounds), otplib (TOTP) |
| QR Codes | qrcode (base64 PNG generation) |

---

## Project Structure

```
deja-view/
|
|-- package.json                   # Workspace root (npm workspaces)
|-- shared/
|   |-- constants.js               # Error messages, thresholds, TOTP config
|
|-- client/                        # React + Vite frontend
|   |-- package.json
|   |-- vite.config.js
|   |-- index.html
|   |-- public/
|   |   |-- models/                # face-api.js ML model weights (6 files)
|   |       |-- tiny_face_detector_model.*
|   |       |-- face_landmark_68_model.*
|   |       |-- face_recognition_model.*
|   |-- src/
|       |-- main.jsx               # React entry point
|       |-- App.jsx                # Router + route guards (RequireAuth / RequireGuest)
|       |-- components/
|       |   |-- Alert.jsx          # Error/success alert banner
|       |   |-- ImageCapture.jsx   # Webcam photo capture + SHA-256 hashing
|       |   |-- ImagePicker.jsx    # File upload for photo key (new device login)
|       |   |-- StepIndicator.jsx  # Multi-step progress indicator
|       |   |-- WebcamCapture.jsx  # Face detection with liveness check
|       |-- hooks/
|       |   |-- useAuth.jsx        # AuthContext provider (login, logout, refreshUser)
|       |-- pages/
|       |   |-- LoginPage.jsx      # 3-step login: photo -> face/passkey -> TOTP
|       |   |-- RegisterPage.jsx   # 4-step registration: account -> face -> TOTP -> passkey
|       |   |-- DashboardPage.jsx  # Post-auth: factor status cards + login history
|       |-- utils/
|       |   |-- api.js             # HTTP client for all API endpoints
|       |   |-- capturedImageStore.js  # localStorage for photo + hash per username
|       |   |-- faceDetection.js   # face-api.js model loading + descriptor extraction
|       |   |-- imageHash.js       # SHA-256 hashing utility
|       |-- styles/
|           |-- global.css         # Dark theme, auth cards, webcam UI, passkey toggle
|
|-- server/                        # Express backend
    |-- package.json
    |-- .env                       # JWT_SECRET, DB_PATH, CORS origins, port
    |-- .env.example
    |-- index.js                   # Express app, CORS, route mounting
    |-- db/
    |   |-- database.js            # SQLite schema (users, login_attempts, passkeys)
    |   |-- deja_view.sqlite       # SQLite database file (auto-created)
    |-- middleware/
    |   |-- auth.js                # JWT verification (requireAuth) + rate limiter
    |-- routes/
        |-- register.js            # /api/register/init, /verify-totp, /save-face
        |-- login.js               # /api/login/verify-image, /verify-face, /verify-totp
        |-- passkey.js             # /api/passkey/register-*, /login-*
        |-- user.js                # /api/user/me, /login-history
```

---

## API Reference

### Registration

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST | `/api/register/init` | `{username, password, imageHash}` | Create account, get TOTP QR code |
| POST | `/api/register/save-face` | `{userId, faceDescriptor[128]}` | Store face descriptor |
| POST | `/api/register/verify-totp` | `{userId, totpCode}` | Confirm TOTP enrollment |
| POST | `/api/passkey/register-options` | `{userId}` | Get WebAuthn registration challenge |
| POST | `/api/passkey/register-verify` | `{userId, credential}` | Verify and store passkey |

### Login (sequential -- each step returns a partial JWT)

| Method | Endpoint | Auth | Body | Description |
|--------|----------|------|------|-------------|
| POST | `/api/login/verify-image` | -- | `{username, imageHash}` | Factor 1: returns partialToken |
| POST | `/api/login/verify-face` | `partialToken` | `{faceDescriptor[]}` | Factor 2a: face scan |
| POST | `/api/passkey/login-options` | `partialToken` | -- | Factor 2b: get passkey challenge |
| POST | `/api/passkey/login-verify` | `partialToken` | `{credential}` | Factor 2b: verify passkey |
| POST | `/api/login/verify-totp` | `partialToken` | `{totpCode}` | Factor 3: returns sessionToken |

### Protected Routes

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/user/me` | `sessionToken` | User profile + enrolled factor status |
| GET | `/api/user/login-history` | `sessionToken` | Last 20 login attempts |
| GET | `/api/health` | -- | Server health check |

---

## Database Schema

### `users`
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| username | TEXT UNIQUE | Case-insensitive |
| password_hash | TEXT | bcrypt (12 rounds) |
| image_hash | TEXT | SHA-256 hex (64 chars) |
| totp_secret | TEXT | Base32 TOTP secret |
| totp_enabled | INTEGER | 0 or 1 |
| face_descriptor | TEXT | JSON array of 128 floats |
| passkey_enabled | INTEGER | 0 or 1 |
| created_at | INTEGER | Unix timestamp |
| last_login | INTEGER | Unix timestamp |

### `passkeys`
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| user_id | INTEGER FK | References users(id) |
| credential_id | TEXT UNIQUE | Base64url credential ID |
| public_key | TEXT | Base64url public key |
| counter | INTEGER | Replay prevention counter |
| device_type | TEXT | singleDevice or multiDevice |
| backed_up | INTEGER | 1 if synced passkey |
| created_at | INTEGER | Unix timestamp |

### `login_attempts`
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| username | TEXT | Who attempted |
| success | INTEGER | 0 = failed, 1 = success |
| factor | TEXT | Which factor failed (image_hash, face, totp, passkey) |
| ip | TEXT | Request IP |
| attempted_at | INTEGER | Unix timestamp |

---

## Quick Start

### Prerequisites
- Node.js 18+
- npm 9+

### Install

```bash
npm run install:all
```

### Configure

```bash
cp server/.env.example server/.env
# Edit server/.env -- at minimum change JWT_SECRET to a long random string
```

### Download face-api.js models

```bash
mkdir -p client/public/models
cd client/public/models

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

### Run (development)

```bash
npm run dev
```

Starts both the Vite dev server (port 5173) and Express API (port 3001).

Open http://localhost:5173

### Reset Database

```bash
npm run db:reset --workspace=server
```

---

## Configuration

### Environment Variables (`server/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3001 | Express server port |
| NODE_ENV | development | Environment mode |
| JWT_SECRET | -- | Secret for signing JWTs (required) |
| JWT_EXPIRY | 2h | Session token lifetime |
| DB_PATH | ./db/deja_view.sqlite | SQLite database path |
| ALLOWED_ORIGINS | http://localhost:5173 | Comma-separated CORS origins |
| RP_ID | localhost | WebAuthn Relying Party ID (your domain) |
| RP_ORIGIN | http://localhost:5173 | WebAuthn expected origin |

### Face Match Threshold

In `shared/constants.js`:
```js
export const FACE_MATCH_THRESHOLD = 0.55;
// 0.4 = strict (fewer false accepts, more false rejects)
// 0.6 = lenient (more false accepts, fewer false rejects)
```

---

## License
Academic project -- HTU Jordan, 2026.
