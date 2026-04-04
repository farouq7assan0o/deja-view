const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

async function request(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();

  if (!res.ok) {
    const err = new Error(data.message || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }

  return data;
}

// Registration
export const api = {
  // --- REGISTER ---
  registerInit: (username, password, imageHash) =>
    request('POST', '/register/init', { username, password, imageHash }),

  registerVerifyTotp: (userId, totpCode) =>
    request('POST', '/register/verify-totp', { userId, totpCode }),

  registerSaveFace: (userId, faceDescriptor) =>
    request('POST', '/register/save-face', { userId, faceDescriptor }),

  // --- LOGIN ---
  loginVerifyImage: (username, imageHash) =>
    request('POST', '/login/verify-image', { username, imageHash }),

  loginVerifyFace: (faceDescriptor, partialToken) =>
    request('POST', '/login/verify-face', { faceDescriptor }, partialToken),

  loginVerifyTotp: (totpCode, partialToken) =>
    request('POST', '/login/verify-totp', { totpCode }, partialToken),

  // --- USER ---
  getMe: (sessionToken) =>
    request('GET', '/user/me', null, sessionToken),

  getLoginHistory: (sessionToken) =>
    request('GET', '/user/login-history', null, sessionToken),

  // --- PASSKEY ---
  passkeyRegisterOptions: (userId) =>
    request('POST', '/passkey/register-options', { userId }),

  passkeyRegisterVerify: (userId, credential) =>
    request('POST', '/passkey/register-verify', { userId, credential }),

  passkeyLoginOptions: (partialToken) =>
    request('POST', '/passkey/login-options', {}, partialToken),

  passkeyLoginVerify: (credential, partialToken) =>
    request('POST', '/passkey/login-verify', { credential }, partialToken),

  // --- HEALTH ---
  health: () => request('GET', '/health'),
};
