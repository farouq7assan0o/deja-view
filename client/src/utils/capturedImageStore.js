/**
 * capturedImageStore
 *
 * At registration, the user takes a live photo. We save it to
 * localStorage as a base64 JPEG (keyed by username) so they can
 * "use" it automatically at login without needing to re-upload.
 *
 * The image stays on this device only — it's never sent to the server.
 * Only the SHA-256 hash is transmitted.
 *
 * If the user clears localStorage or logs in from another device,
 * they'll need to upload the original photo file (or retake — but
 * retake produces a different hash, so they'd need to re-register).
 * This is intentional: the image IS the key. Losing it = losing access.
 */

const KEY_PREFIX = 'dv_img_';

export function saveRegistrationPhoto(username, dataUrl) {
  try {
    localStorage.setItem(KEY_PREFIX + username.toLowerCase(), dataUrl);
  } catch (e) {
    // Storage quota exceeded — warn but don't break registration
    console.warn('[imageStore] Could not save photo to localStorage:', e.message);
  }
}

export function loadRegistrationPhoto(username) {
  return localStorage.getItem(KEY_PREFIX + username.toLowerCase()) || null;
}

export function clearRegistrationPhoto(username) {
  localStorage.removeItem(KEY_PREFIX + username.toLowerCase());
}

/**
 * Compute SHA-256 + timestamp-salt hash from a dataUrl.
 * Must use the SAME timestamp that was used at registration —
 * which is why we store the hash alongside the image.
 *
 * Actually: we store the final HASH in localStorage too, not just the image.
 * This way login just reads the stored hash directly.
 */
const HASH_PREFIX = 'dv_hash_';

export function saveRegistrationHash(username, hash) {
  localStorage.setItem(HASH_PREFIX + username.toLowerCase(), hash);
}

export function loadRegistrationHash(username) {
  return localStorage.getItem(HASH_PREFIX + username.toLowerCase()) || null;
}
