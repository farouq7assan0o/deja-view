import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import getDB from '../db/database.js';
import { ERRORS } from '../../shared/constants.js';

const router = express.Router();

/**
 * GET /api/user/me
 * Returns the current user's profile. Requires valid session JWT.
 */
router.get('/me', requireAuth, (req, res) => {
  const db = getDB();
  const user = db.prepare(
    'SELECT id, username, totp_enabled, face_descriptor IS NOT NULL as has_face, passkey_enabled as has_passkey, created_at, last_login FROM users WHERE id = ?'
  ).get(req.user.userId);

  if (!user) {
    return res.status(404).json({ status: 'error', message: ERRORS.USER_NOT_FOUND });
  }

  return res.json({
    status: 'success',
    user: {
      id: user.id,
      username: user.username,
      factorsEnrolled: {
        imageHash: true, // always enrolled at registration
        face: !!user.has_face,
        totp: !!user.totp_enabled,
        passkey: !!user.has_passkey,
      },
      createdAt: user.created_at,
      lastLogin: user.last_login,
    },
  });
});

/**
 * GET /api/user/login-history
 * Returns recent login attempts for the current user.
 */
router.get('/login-history', requireAuth, (req, res) => {
  const db = getDB();
  const attempts = db.prepare(`
    SELECT success, factor, ip, attempted_at
    FROM login_attempts
    WHERE username = ?
    ORDER BY attempted_at DESC
    LIMIT 20
  `).all(req.user.username);

  return res.json({ status: 'success', attempts });
});

export default router;
