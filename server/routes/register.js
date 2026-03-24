import express from 'express';
import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import qrcode from 'qrcode';
import getDB from '../db/database.js';
import { ERRORS, TOTP_CONFIG } from '../../shared/constants.js';

const router = express.Router();

/**
 * POST /api/register/init
 * Step 1: Create account with username + password + image hash.
 * Returns a session token (partial — not yet fully enrolled).
 *
 * Body: { username, password, imageHash }
 */
router.post('/init', async (req, res) => {
  const { username, password, imageHash } = req.body;

  if (!username || !password || !imageHash) {
    return res.status(400).json({ status: 'error', message: ERRORS.MISSING_FIELDS });
  }

  if (username.length < 3 || username.length > 32) {
    return res.status(400).json({ status: 'error', message: 'Username must be 3–32 characters.' });
  }

  if (password.length < 8) {
    return res.status(400).json({ status: 'error', message: 'Password must be at least 8 characters.' });
  }

  // imageHash must be a 64-char hex string (SHA-256)
  if (!/^[a-f0-9]{64}$/.test(imageHash)) {
    return res.status(400).json({ status: 'error', message: 'Invalid image hash format.' });
  }

  const db = getDB();

  // Check username availability
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ status: 'error', message: ERRORS.USER_EXISTS });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    // Generate TOTP secret for this user
    authenticator.options = {
      issuer: TOTP_CONFIG.issuer,
      algorithm: TOTP_CONFIG.algorithm,
      digits: TOTP_CONFIG.digits,
      step: TOTP_CONFIG.period,
      window: TOTP_CONFIG.window,
    };
    const totpSecret = authenticator.generateSecret();

    // Insert user (totp_enabled = 0 until TOTP step is verified)
    const result = db.prepare(`
      INSERT INTO users (username, password_hash, image_hash, totp_secret, totp_enabled)
      VALUES (?, ?, ?, ?, 0)
    `).run(username, passwordHash, imageHash, totpSecret);

    const userId = result.lastInsertRowid;

    // Generate TOTP QR code for authenticator app enrollment
    const otpAuthUrl = authenticator.keyuri(username, TOTP_CONFIG.issuer, totpSecret);
    const qrDataUrl = await qrcode.toDataURL(otpAuthUrl);

    return res.status(201).json({
      status: 'success',
      message: 'Account created. Complete TOTP enrollment.',
      userId,
      totp: {
        secret: totpSecret, // show once for manual entry
        qrCode: qrDataUrl,  // base64 PNG for display
        otpAuthUrl,
      },
    });
  } catch (err) {
  console.error('[register/init FULL ERROR]', err);

  return res.status(500).json({
    status: 'error',
    message: err.message, // 👈 THIS is the key change
    stack: err.stack      // 👈 optional but useful
  });
}
});

/**
 * POST /api/register/verify-totp
 * Step 2: User scans QR code and enters first TOTP code to confirm enrollment.
 *
 * Body: { userId, totpCode }
 */
router.post('/verify-totp', (req, res) => {
  const { userId, totpCode } = req.body;

  if (!userId || !totpCode) {
    return res.status(400).json({ status: 'error', message: ERRORS.MISSING_FIELDS });
  }

  const db = getDB();
  const user = db.prepare('SELECT totp_secret, totp_enabled FROM users WHERE id = ?').get(userId);

  if (!user) {
    return res.status(404).json({ status: 'error', message: ERRORS.USER_NOT_FOUND });
  }

  if (user.totp_enabled) {
    return res.status(400).json({ status: 'error', message: 'TOTP already enabled.' });
  }

  authenticator.options = {
    digits: TOTP_CONFIG.digits,
    step: TOTP_CONFIG.period,
    window: TOTP_CONFIG.window,
  };

  const valid = authenticator.verify({ token: totpCode, secret: user.totp_secret });

  if (!valid) {
    return res.status(401).json({ status: 'error', message: ERRORS.INVALID_TOTP });
  }

  db.prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').run(userId);

  return res.json({
    status: 'success',
    message: 'TOTP enrolled successfully. Registration complete.',
  });
});

/**
 * POST /api/register/save-face
 * Step 3: Save the face descriptor (128-float array from face-api.js).
 * This runs client-side — only the descriptor is sent, never the image.
 *
 * Body: { userId, faceDescriptor: number[] }
 */
router.post('/save-face' , (req, res) => {
  const { userId, faceDescriptor } = req.body;

  if (!userId || !faceDescriptor) {
    return res.status(400).json({ status: 'error', message: ERRORS.MISSING_FIELDS });
  }

  if (!Array.isArray(faceDescriptor) || faceDescriptor.length !== 128) {
    // 🔥 Reject weak / bad face descriptors
const variance = faceDescriptor.reduce((sum, v) => sum + v * v, 0) / faceDescriptor.length;

if (variance < 0.01) {
  return res.status(400).json({
    status: 'error',
    message: 'Face too unclear — please face the camera directly.'
  });
}
    return res.status(400).json({
      status: 'error',
      message: 'faceDescriptor must be an array of 128 numbers.',
    });
  }

  const db = getDB();
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(404).json({ status: 'error', message: ERRORS.USER_NOT_FOUND });
  }

  db.prepare('UPDATE users SET face_descriptor = ? WHERE id = ?')
    .run(JSON.stringify(faceDescriptor), userId);

  return res.json({ status: 'success', message: 'Face descriptor saved.' });
});

export default router;
