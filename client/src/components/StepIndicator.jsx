/**
 * StepIndicator
 * Shows progress through multi-step auth flow.
 *
 * Props:
 *   steps: string[]     — step labels
 *   current: number     — 0-indexed current step
 */
export default function StepIndicator({ steps, current }) {
  return (
    <div className="step-indicator">
      {steps.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'active' : 'pending';
        return (
          <div key={i} className={`step-item ${state}`}>
            <div className="step-circle">
              {state === 'done' ? '✓' : i + 1}
            </div>
            <span className="step-label">{label}</span>
            {i < steps.length - 1 && <div className="step-line" />}
          </div>
        );
      })}
    </div>
  );
}
