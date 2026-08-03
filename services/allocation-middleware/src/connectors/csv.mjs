export function parseGiftCsv(text) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  const idx = (name) => headers.indexOf(name);
  const required = ['chargeId', 'netAmount'];
  for (const r of required) {
    if (idx(r) < 0) throw new Error(`csv missing column: ${r}`);
  }
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    const get = (name) => {
      const j = idx(name);
      return j >= 0 ? cols[j] : '';
    };
    rows.push({
      chargeId: get('chargeId'),
      netAmount: get('netAmount'),
      amount: get('amount') || get('netAmount'),
      campaignKey: get('campaignKey') || '',
      programKey: get('programKey') || '',
      currency: get('currency') || 'USD',
      donatedAt: get('donatedAt') || '',
    });
  }
  return rows;
}
