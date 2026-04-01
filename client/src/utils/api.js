const BASE = '/api';

async function request(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
}

export const api = {
  // ── REGISTER ──────────────────────────────────────────────
  registerInit: (username, password, imageHash) =>
    request('POST', '/register/init', { username, password, imageHash }),

  registerVerifyTotp: (userId, totpCode) =>
    request('POST', '/register/verify-totp', { userId, totpCode }),

  registerSaveFace: (userId, faceDescriptor) =>
    request('POST', '/register/save-face', { userId, faceDescriptor }),

  // ── LOGIN ─────────────────────────────────────────────────
  // Step 0: get a one-time nonce from the server before sending image proof
  getImageNonce: (username) =>
    request('GET', `/login/nonce?username=${encodeURIComponent(username)}`),

  // Step 1: send HMAC-SHA256(imageHash, nonce) — NOT the raw hash
  loginVerifyImage: (username, imageResponse) =>
    request('POST', '/login/verify-image', { username, imageResponse }),

  loginVerifyFace: (faceDescriptor, partialToken) =>
    request('POST', '/login/verify-face', { faceDescriptor }, partialToken),

  loginVerifyTotp: (totpCode, partialToken) =>
    request('POST', '/login/verify-totp', { totpCode }, partialToken),

  // ── USER ──────────────────────────────────────────────────
  getMe: (sessionToken) =>
    request('GET', '/user/me', null, sessionToken),

  getLoginHistory: (sessionToken) =>
    request('GET', '/user/login-history', null, sessionToken),

  health: () => request('GET', '/health'),
};
