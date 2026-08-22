import { parseAmount } from '../domain/money.mjs';

/**
 * Vendor amounts arrive as strings ("100.0") or numbers (250, 0.59).
 * Returns cents or null when the value is not numeric. Does not invent a net.
 */
export function vendorAmountToCents(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    try {
      return parseAmount(value.toFixed(2)).cents;
    } catch {
      return null;
    }
  }
  const raw = String(value).trim();
  if (!raw) return null;
  try {
    return parseAmount(raw).cents;
  } catch {
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return null;
    try {
      return parseAmount(numeric.toFixed(2)).cents;
    } catch {
      return null;
    }
  }
}

export function isTruthyOptIn(value) {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }
  return false;
}
