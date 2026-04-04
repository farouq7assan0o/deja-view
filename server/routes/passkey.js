import express from 'express';
import jwt from 'jsonwebtoken';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import getDB from '../db/database.js';
import { ERRORS } from '../../shared/constants.js';

const router = express.Router();

// ── Relying Party config ────────────────────────────────────
// In production, set RP_ID and RP_ORIGIN env vars to your domain
const RP_NAME = 'Déjà View';
const RP_ID = process.env.RP_ID || 'localhost';
const RP_ORIGIN = process.env.RP_ORIGIN || 'http://localhost:5173';

// In-memory challenge store (swap for Redis in production)
const challenges = new Map();
function storeChallenge(key, challenge) {
  challenges.set(key, { challenge, expires: Date.now() + 5 * 60 * 1000 });
}
function getChallenge(key) {
  const entry = challenges.get(key);
  if (!entry) return null;
  challenges.delete(key);
  if (Date.now() > entry.expires) return null;
  return entry.challenge;
}

// ─────────────────────────────────────────────────────────────
// REGISTRATION: Generate options for navigator.credentials.create()
// ─────────────────────────────────────────────────────────────
router.post('/register-options', async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ status: 'error', message: ERRORS.MISSING_FIELDS });
  }

  const db = getDB();
  const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(404).json({ status: 'error', message: ERRORS.USER_NOT_FOUND });
  }

  // Get existing passkeys so the browser excludes them
  const existing = db.prepare('SELECT credential_id FROM passkeys WHERE user_id = ?').all(userId);

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: new TextEncoder().encode(String(user.id)),
    userName: user.username,
    userDisplayName: user.username,
    attestationType: 'none',
    authenticatorSelection: {
      authenticatorAttachment: 'platform',   // phone biometric only
      residentKey: 'preferred',
      userVerification: 'required',          // must use biometric/PIN
    },
    excludeCredentials: existing.map(c => ({
      id: c.credential_id,
      type: 'public-key',
    })),
  });

  // Store challenge for verification
  storeChallenge(`reg:${userId}`, options.challenge);

  return res.json({ status: 'success', options });
});

// ─────────────────────────────────────────────────────────────
// REGISTRATION: Verify the credential and store it
// ─────────────────────────────────────────────────────────────
router.post('/register-verify', async (req, res) => {
  const { userId, credential } = req.body;
  if (!userId || !credential) {
    return res.status(400).json({ status: 'error', message: ERRORS.MISSING_FIELDS });
  }

  const expectedChallenge = getChallenge(`reg:${userId}`);
  if (!expectedChallenge) {
    return res.status(400).json({ status: 'error', message: 'Challenge expired. Try again.' });
  }

  try {
    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge,
      expectedOrigin: RP_ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ status: 'error', message: 'Passkey verification failed.' });
    }

    const { credential: cred, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

    const db = getDB();

    // Store the credential
    db.prepare(`
      INSERT INTO passkeys (user_id, credential_id, public_key, counter, device_type, backed_up)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      cred.id,
      Buffer.from(cred.publicKey).toString('base64url'),
      cred.counter,
      credentialDeviceType,
      credentialBackedUp ? 1 : 0,
    );

    // Mark user as passkey-enabled
    db.prepare('UPDATE users SET passkey_enabled = 1 WHERE id = ?').run(userId);

    return res.json({
      status: 'success',
      message: 'Passkey registered. You can now use it to log in.',
    });
  } catch (err) {
    console.error('[passkey register-verify]', err);
    return res.status(400).json({ status: 'error', message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// LOGIN: Generate options for navigator.credentials.get()
// ─────────────────────────────────────────────────────────────
router.post('/login-options', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ status: 'error', message: ERRORS.INVALID_TOKEN });
  }

  let payload;
  try {
    payload = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ status: 'error', message: ERRORS.INVALID_TOKEN });
  }

  if (payload.step !== 'image_verified') {
    return res.status(403).json({ status: 'error', message: 'Complete image verification first.' });
  }

  const db = getDB();
  const passkeys = db.prepare('SELECT credential_id FROM passkeys WHERE user_id = ?').all(payload.userId);

  if (passkeys.length === 0) {
    return res.status(400).json({ status: 'error', message: 'No passkey enrolled.' });
  }

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: 'required',
    allowCredentials: passkeys.map(p => ({
      id: p.credential_id,
      type: 'public-key',
    })),
  });

  storeChallenge(`login:${payload.userId}`, options.challenge);

  return res.json({ status: 'success', options });
});

// ─────────────────────────────────────────────────────────────
// LOGIN: Verify passkey assertion — replaces face scan step
// ─────────────────────────────────────────────────────────────
router.post('/login-verify', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ status: 'error', message: ERRORS.INVALID_TOKEN });
  }

  let payload;
  try {
    payload = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ status: 'error', message: ERRORS.INVALID_TOKEN });
  }

  if (payload.step !== 'image_verified') {
    return res.status(403).json({ status: 'error', message: 'Complete image verification first.' });
  }

  const { credential } = req.body;
  if (!credential) {
    return res.status(400).json({ status: 'error', message: ERRORS.MISSING_FIELDS });
  }

  const expectedChallenge = getChallenge(`login:${payload.userId}`);
  if (!expectedChallenge) {
    return res.status(400).json({ status: 'error', message: 'Challenge expired. Try again.' });
  }

  const db = getDB();
  const stored = db.prepare(
    'SELECT credential_id, public_key, counter FROM passkeys WHERE user_id = ? AND credential_id = ?'
  ).get(payload.userId, credential.id);

  if (!stored) {
    return res.status(401).json({ status: 'error', message: 'Unknown passkey.' });
  }

  try {
    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge,
      expectedOrigin: RP_ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
      credential: {
        id: stored.credential_id,
        publicKey: Buffer.from(stored.public_key, 'base64url'),
        counter: stored.counter,
      },
    });

    if (!verification.verified) {
      db.prepare(
        `INSERT INTO login_attempts (username, success, factor, ip) VALUES (?, 0, 'passkey', ?)`
      ).run(payload.username, req.ip);
      return res.status(401).json({ status: 'error', message: 'Passkey verification failed.' });
    }

    // Update counter to prevent replay
    db.prepare('UPDATE passkeys SET counter = ? WHERE credential_id = ?')
      .run(verification.authenticationInfo.newCounter, stored.credential_id);

    // Advance to face_verified step (passkey replaces face scan)
    const partialToken = jwt.sign(
      { userId: payload.userId, username: payload.username, step: 'face_verified' },
      process.env.JWT_SECRET,
      { expiresIn: '5m' }
    );

    return res.json({
      status: 'success',
      message: 'Passkey verified.',
      partialToken,
    });
  } catch (err) {
    console.error('[passkey login-verify]', err);
    return res.status(400).json({ status: 'error', message: err.message });
  }
});

export default router;
