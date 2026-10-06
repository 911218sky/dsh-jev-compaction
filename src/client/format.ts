/**
 * Read-only helpers for the settings card.
 */

const BYTE_UNITS = ["B", "KB", "MB", "GB"] as const;

/** Human-readable byte size for the archive limit field. */
export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = Math.round(value * 10) / 10;
  return `${rounded} ${BYTE_UNITS[unit]}`;
}

/**
 * Say how many candidate runs the current thresholds plausibly admit. This is
 * a read-only projection of the trigger numbers, not a measurement.
 */
export function triggerSummary(
  thresholdChars: number,
  minLines: number,
): string {
  return `${thresholdChars} chars, ${minLines}+ lines, or repeated lines`;
}
