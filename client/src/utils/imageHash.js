/**
 * Computes a SHA-256 hash of a File object entirely in the browser.
 * The raw file bytes are hashed — no upload happens.
 * Returns a lowercase hex string (64 chars).
 */
export async function hashImageFile(file) {
  if (!(file instanceof File)) throw new Error('Expected a File object.');

  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Validates that the selected file is an image of an acceptable type/size.
 * Returns null if valid, or an error string if not.
 */
export function validateImageFile(file, maxMb = 10) {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowedTypes.includes(file.type)) {
    return `Unsupported file type: ${file.type}. Use JPEG, PNG, WebP, or GIF.`;
  }
  if (file.size > maxMb * 1024 * 1024) {
    return `File too large (max ${maxMb} MB).`;
  }
  return null;
}
