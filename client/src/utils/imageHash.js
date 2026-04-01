/**
 * imageHash.js — client-side image hashing and challenge-response
 *
 * hashImageFromCanvas(canvas): SHA-256 of raw pixel bytes only (no timestamp).
 *   - Same image always produces same hash
 *   - SHA-256 alone guarantees uniqueness: 1 pixel different = completely different hash
 *
 * computeImageResponse(imageHash, nonce): HMAC-SHA256(imageHash, nonce)
 *   - This is what gets sent to the server at login (NOT the raw hash)
 *   - Even if someone intercepts this value from the network, it's useless:
 *     it only works for this specific nonce, which the server has already consumed
 */

/**
 * Compute SHA-256 of raw pixel bytes from a canvas data URL.
 * Used at registration — result is stored on server and in localStorage.
 */
export async function hashFromDataUrl(dataUrl) {
  const blob   = await (await fetch(dataUrl)).blob();
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compute HMAC-SHA256(imageHash, nonce) using Web Crypto API.
 * Used at LOGIN — sends this instead of the raw hash.
 *
 * The nonce comes from the server's GET /api/login/nonce endpoint.
 * Server computes the same HMAC using the stored hash and the same nonce,
 * then compares. If they match → image verified, nonce consumed (single use).
 */
export async function computeImageResponse(imageHash, nonce) {
  const enc = new TextEncoder();

  // Import the nonce as a raw HMAC key
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(nonce),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // HMAC(nonce, imageHash)
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(imageHash));

  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Validates that a file is an acceptable image type and size.
 * Returns null if valid, error string if not.
 */
export function validateImageFile(file, maxMb = 10) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowed.includes(file.type)) return `Unsupported type: ${file.type}`;
  if (file.size > maxMb * 1024 * 1024) return `File too large (max ${maxMb} MB)`;
  return null;
}

/**
 * SHA-256 of a File object (for the upload fallback in login).
 */
export async function hashImageFile(file) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}
