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
      email: get('email') || '',
      donorPrincipal: get('donorPrincipal') || get('donorId') || '',
    });
  }
  return rows;
}

/**
 * Map a parsed CSV row onto the every.org gift-completed shape so
 * normalizeEveryOrgDonation + chargeId credit is the same persist path.
 * Copies connector contact only when the row actually has it.
 */
export function csvRowToEveryOrgPayload(row, { donatedAtFallback } = {}) {
  const payload = {
    chargeId: row?.chargeId,
    netAmount: row?.netAmount,
    amount: row?.amount || row?.netAmount,
    currency: row?.currency || 'USD',
  };
  if (row?.donatedAt) payload.donationDate = row.donatedAt;
  else if (donatedAtFallback) payload.donationDate = donatedAtFallback;
  if (row?.campaignKey) payload.fromFundraiser = { title: row.campaignKey };
  if (row?.programKey) payload.designation = row.programKey;
  if (row?.email) payload.email = row.email;
  if (row?.donorPrincipal) payload.donorId = row.donorPrincipal;
  return payload;
}
