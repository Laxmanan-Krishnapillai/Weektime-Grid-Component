export function parseIntegerValue(raw: unknown, maxValue: number): number | null {
  if (typeof raw === 'number' && Number.isInteger(raw)) {
    if (raw < 0 || raw > maxValue) return null;
    return raw;
  }
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim().replace(',', '.');
  if (trimmed === '') return null;
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
    return null;
  }
  if (numeric < 0 || numeric > maxValue) {
    return null;
  }
  return numeric;
}
