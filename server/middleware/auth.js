import jwt from 'jsonwebtoken';
import { ERRORS } from '../../shared/constants.js';

/**
 * Verifies the JWT from the Authorization header.
 * Attaches decoded payload to req.user.
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ status: 'error', message: ERRORS.INVALID_TOKEN });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ status: 'error', message: ERRORS.INVALID_TOKEN });
  }
}

/**
 * Rate limiter: max N attempts per username per window.
 * In-memory for dev — swap for Redis in production.
 */
const attempts = new Map();

export function rateLimitLogin(maxAttempts = 5, windowMs = 15 * 60 * 1000) {
  return (req, res, next) => {
    const key = (req.body?.username || req.ip || 'unknown').toLowerCase();
    const now = Date.now();
    const record = attempts.get(key) || { count: 0, resetAt: now + windowMs };

    if (now > record.resetAt) {
      record.count = 0;
      record.resetAt = now + windowMs;
    }

    record.count += 1;
    attempts.set(key, record);

    if (record.count > maxAttempts) {
      const retryAfter = Math.ceil((record.resetAt - now) / 1000);
      return res.status(429).json({
        status: 'error',
        message: `Too many attempts. Try again in ${retryAfter}s.`,
      });
    }

    next();
  };
}
