import { hasContactableIdentity } from '../connectors/contact.mjs';
import { publicDonationLink } from './donation-link.mjs';

export function createNoopNotifier() {
  return {
    emailConfigured: false,
    async sendEmail() {
      return { ok: false, skipped: true, reason: 'email_transport_not_configured' };
    },
  };
}

export function createResendNotifier(env = {}, options = {}) {
  const apiKey = env.RESEND_API_KEY || '';
  const from = env.RESEND_FROM || env.AUTH_EMAIL_FROM || '';
  const fetchImpl = options.fetchImpl || fetch;
  return {
    emailConfigured: Boolean(apiKey && from),
    async sendEmail({ to, subject, text, html }) {
      if (!apiKey || !from) {
        return { ok: false, skipped: true, reason: 'email_transport_not_configured' };
      }
      try {
        const response = await fetchImpl('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ from, to: [to], subject, text, html }),
        });
        if (!response.ok) return { ok: false, reason: 'email_send_failed' };
        return { ok: true };
      } catch {
        return { ok: false, reason: 'email_send_failed' };
      }
    },
  };
}

export function contactsForAllocation(state, allocation) {
  const contacts = [];
  for (const gift of state.gifts.values()) {
    if (gift.orgId !== allocation.orgId) continue;
    if (gift.campaignKey !== allocation.campaignKey) continue;
    if (gift.programKey !== allocation.programKey) continue;
    const contact = (state.giftContacts && state.giftContacts.get(gift.chargeId)) || null;
    if (!hasContactableIdentity(contact)) continue;
    contacts.push({ chargeId: gift.chargeId, ...contact });
  }
  return contacts;
}

function primaryChannel(contact) {
  if (contact?.donorPrincipal) return 'in_app';
  if (contact?.email) return 'email';
  return null;
}

function useSummaryFor(allocation) {
  return String(allocation?.purpose || '').trim();
}

/**
 * Decide whether a CONTRACT-013 ImpactNotice may be created.
 * Allocation or webhook alone is never enough.
 */
export function evaluateImpactNotice({
  allocation,
  donationLink,
  contacts,
  existingNotice,
  evidenceId,
  proofWaived,
}) {
  if (existingNotice) {
    return { issue: false, reason: 'already_issued', notice: existingNotice };
  }
  if (!allocation) {
    return { issue: false, reason: 'allocation_not_found' };
  }
  if (!proofWaived && !evidenceId) {
    return { issue: false, reason: 'evidence_or_waive_required' };
  }
  const link = publicDonationLink(donationLink);
  if (!link) {
    return { issue: false, reason: 'no_donation_link' };
  }
  const contactable = (contacts || []).filter(hasContactableIdentity);
  if (contactable.length === 0) {
    return { issue: false, reason: 'no_contact' };
  }
  const summary = useSummaryFor(allocation);
  if (!summary) {
    return { issue: false, reason: 'use_summary_required' };
  }
  const contact = contactable[0];
  const channel = primaryChannel(contact);
  if (!channel) {
    return { issue: false, reason: 'no_contact' };
  }
  return {
    issue: true,
    reason: null,
    donationLink: link,
    contact,
    channel,
    useSummary: summary,
  };
}

export function buildImpactNoticeRecord({
  id,
  orgId,
  allocationId,
  evidenceId,
  proofWaived,
  channel,
  donationLink,
  useSummary,
  chargeId,
  createdAt,
}) {
  const notice = {
    impactNoticeId: id,
    allocationId,
    proofWaived: Boolean(proofWaived),
    channel,
    donationLink,
    useSummary,
    createdAt,
    orgId,
  };
  if (proofWaived) {
    notice.evidenceId = evidenceId || null;
  } else {
    notice.evidenceId = evidenceId;
  }
  if (chargeId) notice.chargeId = chargeId;
  return notice;
}

export async function deliverImpactNotice({
  notice,
  contact,
  notifier = createNoopNotifier(),
  idgen = () => crypto.randomUUID(),
  now = () => new Date().toISOString(),
}) {
  const deliveries = [];
  if (contact?.donorPrincipal) {
    deliveries.push({
      id: idgen(),
      noticeId: notice.impactNoticeId,
      orgId: notice.orgId,
      channel: 'in_app',
      status: 'sent',
      attemptedAt: now(),
      detail: 'in_app_recorded',
    });
  }
  if (contact?.email) {
    if (!notifier?.emailConfigured) {
      deliveries.push({
        id: idgen(),
        noticeId: notice.impactNoticeId,
        orgId: notice.orgId,
        channel: 'email',
        status: 'skipped',
        attemptedAt: now(),
        detail: 'email_transport_not_configured',
      });
    } else {
      const result = await notifier.sendEmail({
        to: contact.email,
        subject: 'Your gift was put to work',
        text: `${notice.useSummary}\nGive again: ${notice.donationLink}`,
        html: `<p>${escapeHtml(notice.useSummary)}</p><p><a href="${escapeAttr(notice.donationLink)}">Give again</a></p>`,
      });
      deliveries.push({
        id: idgen(),
        noticeId: notice.impactNoticeId,
        orgId: notice.orgId,
        channel: 'email',
        status: result.ok ? 'sent' : result.skipped ? 'skipped' : 'failed',
        attemptedAt: now(),
        detail: result.reason || (result.ok ? 'sent' : 'email_send_failed'),
      });
    }
  }
  return deliveries;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}
