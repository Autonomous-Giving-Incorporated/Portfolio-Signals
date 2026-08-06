/** @typedef {{ orgId: string, campaignKey: string, programKey: string, creditedCents: bigint, allocatedCents: bigint }} Pot */
/** @typedef {{ chargeId: string, orgId: string, campaignKey: string, programKey: string, netCents: bigint, grossCents: bigint, currency: string, donatedAt: string, source: string }} GiftSummary */
/** @typedef {{ id: string, orgId: string, campaignKey: string, programKey: string, amountCents: bigint, purpose: string, status: 'approved', approvedAt: string, approvedBy: string }} Allocation */
/** @typedef {{ id: string, orgId: string, code: string, message: string, open: boolean, createdAt: string, ref?: object }} ExceptionItem */

export const DEFAULT_CURRENCY = 'USD';
