import { parseAmount } from '../domain/money.mjs';
import { resolvePotPath } from '../domain/pots.mjs';

export function normalizeEveryOrgDonation(payload, { orgId }) {
  if (!payload || typeof payload !== 'object') throw new Error('invalid payload');
  const p = /** @type {Record<string, any>} */ (payload);
  if (!p.chargeId) throw new Error('chargeId required');
  const fundraiserKey =
    p.fromFundraiser?.title || p.fromFundraiser?.slug || p.fromFundraiser?.id || '';
  const { campaignKey, programKey } = resolvePotPath({
    fundraiserKey,
    designationKey: p.designation,
  });
  const net = parseAmount(String(p.netAmount ?? p.amount));
  const gross = parseAmount(String(p.amount ?? p.netAmount));
  return {
    chargeId: String(p.chargeId),
    orgId,
    campaignKey,
    programKey,
    netCents: net.cents,
    grossCents: gross.cents,
    currency: String(p.currency || 'USD'),
    donatedAt: String(p.donationDate || new Date().toISOString()),
    source: 'every.org',
  };
}
