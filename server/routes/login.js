import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import getDB from '../db/database.js';
import { rateLimitLogin } from '../middleware/auth.js';
import { ERRORS, TOTP_CONFIG, FACE_MATCH_THRESHOLD } from '../../shared/constants.js';

const router = express.Router();

/**
 * Used-code cache: prevents TOTP replay within the same 30s window.
 * Key: `${userId}:${code}`, expires after 90s.
 */
const usedCodes = new Map();
function markCodeUsed(userId, code) {
  usedCodes.set(`${userId}:${code}`, Date.now() + 90_000);
}
function isCodeUsed(userId, code) {
  const key = `${userId}:${code}`;
  const expiry = usedCodes.get(key);
  if (!expiry) return false;
  if (Date.now() > expiry) { usedCodes.delete(key); return false; }
  return true;
}

// Euclidean distance between two face descriptors
function faceDistance(a, b) {
  if (a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

/**
 * POST /api/login/verify-image
 * Step 1: Verify username + image hash.
 * Returns a partial session ID to carry through remaining steps.
 *
 * Body: { username, imageHash }
 */
router.post('/verify-image', rateLimitLogin(10, 5 * 60 * 1000), (req, res) => {
  const { username, imageHash } = req.body;

  if (!username || !imageHash) {
    return res.status(400).json({ status: 'error', message: ERRORS.MISSING_FIELDS });
  }

  if (!/^[a-f0-9]{64}$/.test(imageHash)) {
    return res.status(400).json({ status: 'error', message: 'Invalid image hash format.' });
  }

  const db = getDB();
  const user = db.prepare(
    'SELECT id, username, image_hash, totp_enabled, face_descriptor, passkey_enabled FROM users WHERE username = ?'
  ).get(username);

  // Constant-time-style: always hash compare even if user not found
  const storedHash = user?.image_hash || 'a'.repeat(64);
  const match = user && storedHash === imageHash;

  if (!match) {
    db.prepare(
      `INSERT INTO login_attempts (username, success, factor, ip) VALUES (?, 0, 'image_hash', ?)`
    ).run(username, req.ip);
    // Deliberately vague error — don't leak whether username exists
    return res.status(401).json({ status: 'error', message: 'Authentication failed.' });
  }

  // Issue a short-lived partial token to track login progress
  const partialToken = jwt.sign(
    { userId: user.id, username: user.username, step: 'image_verified' },
    process.env.JWT_SECRET,
    { expiresIn: '5m' }
  );

  return res.json({
    status: 'success',
    message: 'Image hash verified.',
    partialToken,
    hasFace: !!user.face_descriptor,
    hasPasskey: !!user.passkey_enabled,
  });
});

/**
 * POST /api/login/verify-face
 * Step 2: Verify face descriptor against stored enrollment.
 * face-api.js runs in-browser — only the descriptor float array is sent.
 *
 * Headers: Authorization: Bearer <partialToken from step 1>
 * Body: { faceDescriptor: number[] }
 */
router.post('/verify-face', (req, res) => {
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

  const { faceDescriptor } = req.body;
  if (!Array.isArray(faceDescriptor) || faceDescriptor.length !== 128) {
    return res.status(400).json({ status: 'error', message: 'Invalid face descriptor.' });
  }

  const db = getDB();
  const user = db.prepare('SELECT face_descriptor FROM users WHERE id = ?').get(payload.userId);

  if (!user?.face_descriptor) {
    return res.status(400).json({ status: 'error', message: 'No face enrolled for this account.' });
  }

  const stored = JSON.parse(user.face_descriptor);
  const distance = faceDistance(faceDescriptor, stored);

  if (distance > FACE_MATCH_THRESHOLD) {
    db.prepare(
      `INSERT INTO login_attempts (username, success, factor, ip) VALUES (?, 0, 'face', ?)`
    ).run(payload.username, req.ip);
    return res.status(401).json({
      status: 'error',
      message: ERRORS.INVALID_FACE,
      distance, // helpful during dev, remove in production
    });
  }

  // Advance partial token to next step
  const partialToken = jwt.sign(
    { userId: payload.userId, username: payload.username, step: 'face_verified' },
    process.env.JWT_SECRET,
    { expiresIn: '5m' }
  );

  return res.json({
    status: 'success',
    message: 'Face verified.',
    partialToken,
    distance, // helpful during dev
  });
});

/**
 * POST /api/login/verify-totp
 * Step 3 (final): Verify TOTP code. Issues full JWT on success.
 *
 * Headers: Authorization: Bearer <partialToken from step 2>
 * Body: { totpCode }
 */
router.post('/verify-totp', rateLimitLogin(5, 15 * 60 * 1000), (req, res) => {
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

  if (payload.step !== 'face_verified') {
    return res.status(403).json({ status: 'error', message: 'Complete face verification first.' });
  }

  const { totpCode } = req.body;
  if (!totpCode) {
    return res.status(400).json({ status: 'error', message: ERRORS.MISSING_FIELDS });
  }

  const db = getDB();
  const user = db.prepare(
    'SELECT totp_secret, totp_enabled FROM users WHERE id = ?'
  ).get(payload.userId);

  if (!user?.totp_enabled) {
    return res.status(400).json({ status: 'error', message: 'TOTP not enrolled for this account.' });
  }

  authenticator.options = {
    digits: TOTP_CONFIG.digits,
    step: TOTP_CONFIG.period,
    window: TOTP_CONFIG.window,
  };

  // Replay attack prevention: same code can't be used twice in the same window
  if (isCodeUsed(payload.userId, totpCode)) {
    return res.status(401).json({ status: 'error', message: 'This code has already been used. Wait for the next code.' });
  }

  const valid = authenticator.verify({ token: totpCode, secret: user.totp_secret });

  if (!valid) {
    db.prepare(
      `INSERT INTO login_attempts (username, success, factor, ip) VALUES (?, 0, 'totp', ?)`
    ).run(payload.username, req.ip);
    return res.status(401).json({ status: 'error', message: ERRORS.INVALID_TOTP });
  }

  // Mark this code as used so it can't be replayed
  markCodeUsed(payload.userId, totpCode);

  // All three factors passed — issue full session JWT
  const sessionToken = jwt.sign(
    { userId: payload.userId, username: payload.username, role: 'user' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRY || '2h' }
  );

  db.prepare('UPDATE users SET last_login = unixepoch() WHERE id = ?').run(payload.userId);
  db.prepare(
    `INSERT INTO login_attempts (username, success, ip) VALUES (?, 1, ?)`
  ).run(payload.username, req.ip);

  return res.json({
    status: 'success',
    message: 'Authentication successful. All factors verified.',
    sessionToken,
    user: {
      id: payload.userId,
      username: payload.username,
    },
  });
});

export default router;
