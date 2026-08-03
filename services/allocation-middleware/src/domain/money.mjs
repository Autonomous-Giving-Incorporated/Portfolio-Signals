export function parseAmount(str) {
  if (typeof str !== 'string' || !/^-?\d+(\.\d{1,2})?$/.test(str.trim())) {
    throw new Error(`invalid amount: ${str}`);
  }
  const [w, f = ''] = str.trim().split('.');
  const frac = (f + '00').slice(0, 2);
  const sign = w.startsWith('-') ? -1n : 1n;
  const whole = BigInt(w.replace('-', '') || '0');
  return { cents: sign * (whole * 100n + BigInt(frac)) };
}

export function addCents(a, b) {
  return a + b;
}

export function subCents(a, b) {
  return a - b;
}

export function formatCents(cents) {
  const sign = cents < 0n ? '-' : '';
  const abs = cents < 0n ? -cents : cents;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, '0');
  return `${sign}${whole}.${frac}`;
}
