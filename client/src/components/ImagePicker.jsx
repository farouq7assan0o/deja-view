import { useState, useCallback } from 'react';
import { hashImageFile, validateImageFile } from '../utils/imageHash.js';

/**
 * ImagePicker
 * File input that computes the SHA-256 hash client-side.
 *
 * Props:
 *   onHash(hash: string, file: File) — called when hash is computed
 *   onError(msg: string)
 *   label — override the label text
 */
export default function ImagePicker({ onHash, onError, label = 'Choose your secret image' }) {
  const [preview, setPreview] = useState(null);
  const [hash, setHash] = useState('');
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState('');

  const handleFile = useCallback(async (file) => {
    if (!file) return;

    const err = validateImageFile(file);
    if (err) {
      onError?.(err);
      return;
    }

    setLoading(true);
    setFileName(file.name);

    try {
      // Show preview
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target.result);
      reader.readAsDataURL(file);

      // Hash — entirely in browser
      const h = await hashImageFile(file);
      setHash(h);
      onHash?.(h, file);
    } catch (err) {
      onError?.(err.message);
    } finally {
      setLoading(false);
    }
  }, [onHash, onError]);

  const handleChange = (e) => handleFile(e.target.files?.[0]);

  const handleDrop = (e) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files?.[0]);
  };

  return (
    <div className="image-picker">
      <label className="image-picker-label">{label}</label>

      <div
        className={`drop-zone ${preview ? 'has-preview' : ''}`}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => document.getElementById('image-file-input').click()}
      >
        {preview ? (
          <img src={preview} alt="Secret image preview" className="preview-img" />
        ) : (
          <div className="drop-hint">
            <span className="drop-icon">🖼</span>
            <span>Drop image here or click to browse</span>
            <span className="drop-sub">JPEG, PNG, WebP — up to 10 MB</span>
          </div>
        )}
      </div>

      <input
        id="image-file-input"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleChange}
        style={{ display: 'none' }}
      />

      {loading && <p className="picker-status">Computing hash…</p>}

      {hash && !loading && (
        <div className="hash-display">
          <span className="hash-label">SHA-256</span>
          <code className="hash-value">{hash.slice(0, 16)}…</code>
          <span className="hash-filename">{fileName}</span>
        </div>
      )}

      <p className="picker-note">
        ⚠ This image is your authentication key. Never change or delete it.
        The image itself is never uploaded — only its fingerprint is stored.
      </p>
    </div>
  );
}
