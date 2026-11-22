'use client';

/**
 * Accessible inline field error message with icon + text (never color alone).
 */
export default function InlineFieldError({ id, error }) {
  if (!error) return null;
  return (
    <span id={id} role="alert" className="form-field-error">
      <span aria-hidden="true">⚠</span>
      <span>{error}</span>
    </span>
  );
}
