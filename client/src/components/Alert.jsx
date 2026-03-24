/**
 * Alert
 * Props: type ('error' | 'success' | 'info'), message, onClose
 */
export default function Alert({ type = 'info', message, onClose }) {
  if (!message) return null;
  return (
    <div className={`alert alert-${type}`} role="alert">
      <span>{message}</span>
      {onClose && (
        <button className="alert-close" onClick={onClose} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}
