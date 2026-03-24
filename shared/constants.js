// Shared constants and types between client and server

// API response structure
export const API_STATUS = {
  SUCCESS: 'success',
  ERROR: 'error',
};

// Auth factor names
export const FACTORS = {
  IMAGE_HASH: 'image_hash',
  FACE: 'face',
  TOTP: 'totp',
};

// Registration steps
export const REGISTER_STEPS = {
  CREDENTIALS: 1,
  IMAGE: 2,
  FACE: 3,
  TOTP: 4,
  DONE: 5,
};

// Login steps
export const LOGIN_STEPS = {
  USERNAME: 1,
  IMAGE: 2,
  FACE: 3,
  TOTP: 4,
  DONE: 5,
};

// Error messages
export const ERRORS = {
  USER_NOT_FOUND: 'User not found',
  USER_EXISTS: 'Username already taken',
  INVALID_IMAGE: 'Image hash does not match',
  INVALID_FACE: 'Face verification failed',
  INVALID_TOTP: 'Invalid TOTP code',
  MISSING_FIELDS: 'Missing required fields',
  SERVER_ERROR: 'Internal server error',
  INVALID_TOKEN: 'Invalid or expired session token',
};

// Face verification threshold (0-1, lower = stricter)
export const FACE_MATCH_THRESHOLD = 0.45;

// TOTP settings
export const TOTP_CONFIG = {
  issuer: 'DejaView',
  algorithm: 'sha1',
  digits: 6,
  period: 30,
  window: 0, // strict — only current 30s window accepted
};
