export type AuthEmailAudience =
  | 'platform_admin'
  | 'tenant_member'
  | 'delegate_invite'
  | 'delegate';

export type AuthEmailTemplateInput = {
  audience: AuthEmailAudience;
  actionUrl: string;
  displayName?: string | null;
  clientName?: string | null;
  role?: string | null;
  scopes?: string[] | null;
  expiresIn?: string | null;
};

export type RenderedAuthEmail = {
  subject: string;
  html: string;
  text: string;
};

const SCOPE_LABELS: Record<string, string> = {
  workspace_access: 'Workspace access',
  identity_support: 'Identity support',
  integration_operations: 'Integration operations',
  delivery_observability: 'Delivery observability',
  configuration_support: 'Configuration support'
};

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[character] || character);
}

function safeName(value?: string | null) {
  return value?.trim() || 'there';
}

function scopeLabels(scopes?: string[] | null) {
  return [...new Set(scopes || [])]
    .filter((scope) => Boolean(SCOPE_LABELS[scope]))
    .map((scope) => SCOPE_LABELS[scope]);
}

function frame({
  eyebrow,
  heading,
  intro,
  actionLabel,
  actionUrl,
  detailHtml = '',
  expiresIn = '15 minutes'
}: {
  eyebrow: string;
  heading: string;
  intro: string;
  actionLabel: string;
  actionUrl: string;
  detailHtml?: string;
  expiresIn?: string | null;
}) {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f4f7f6;color:#17342f;font-family:Arial,sans-serif">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7f6;padding:32px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #dce7e4;border-radius:16px;overflow:hidden">
          <tr><td style="padding:28px 32px;background:#123f36;color:#fff">
            <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.8">${escapeHtml(eyebrow)}</div>
            <div style="font-size:24px;font-weight:700;margin-top:8px">${escapeHtml(heading)}</div>
          </td></tr>
          <tr><td style="padding:32px">
            <p style="margin:0 0 18px;line-height:1.6">${escapeHtml(intro)}</p>
            ${detailHtml}
            <p style="margin:26px 0">
              <a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#19734a;color:#fff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:8px">${escapeHtml(actionLabel)}</a>
            </p>
            <p style="font-size:13px;line-height:1.5;color:#536963">This one-time link expires in ${escapeHtml(expiresIn || '15 minutes')}. If you did not request or expect this email, do not use the link.</p>
            <p style="font-size:13px;line-height:1.5;color:#536963">Authentication grants system access only. It does not grant outreach, allocation, payment, or publication authority.</p>
          </td></tr>
          <tr><td style="padding:18px 32px;border-top:1px solid #dce7e4;font-size:12px;color:#667b75">A.G.I. Portfolio Signals &middot; Software by Zero State</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function renderAuthEmail(input: AuthEmailTemplateInput): RenderedAuthEmail {
  const displayName = safeName(input.displayName);
  const clientName = input.clientName?.trim() || 'your organization';
  const labels = scopeLabels(input.scopes);
  const scopesText = labels.length ? labels.join(', ') : 'Workspace access';
  const details = labels.length
    ? `<div style="padding:14px 16px;background:#eef5f2;border-radius:8px"><strong>Assigned infrastructure scope</strong><ul style="margin:8px 0 0;padding-left:20px">${labels.map((label) => `<li>${escapeHtml(label)}</li>`).join('')}</ul></div>`
    : '';

  if (input.audience === 'platform_admin') {
    const subject = 'Your A.G.I. platform administrator sign-in link';
    return {
      subject,
      html: frame({
        eyebrow: 'A.G.I. platform administration',
        heading: 'Secure administrator sign-in',
        intro: `Hello ${displayName}. Use the link below to continue to the A.G.I. platform control plane.`,
        actionLabel: 'Sign in as platform administrator',
        actionUrl: input.actionUrl,
        detailHtml: '<p style="font-size:13px;line-height:1.5;color:#536963">Platform administration does not grant tenant-private access without an explicit tenant membership.</p>',
        expiresIn: input.expiresIn
      }),
      text: `${subject}\n\nHello ${displayName}. Sign in: ${input.actionUrl}\n\nThis link is one-time and does not grant tenant-private access by itself.`
    };
  }

  if (input.audience === 'delegate_invite') {
    const subject = `${clientName} invited you as an infrastructure delegate`;
    return {
      subject,
      html: frame({
        eyebrow: `${clientName} - infrastructure delegation`,
        heading: 'Accept delegated access',
        intro: `Hello ${displayName}. A tenant director for ${clientName} invited you to support approved infrastructure surfaces.`,
        actionLabel: 'Accept delegate invitation',
        actionUrl: input.actionUrl,
        detailHtml: details,
        expiresIn: input.expiresIn || '72 hours'
      }),
      text: `${subject}\n\nAssigned scope: ${scopesText}\n\nAccept invitation: ${input.actionUrl}\n\nThis access grants no campaign, donor, outreach, payment, or allocation authority.`
    };
  }

  if (input.audience === 'delegate') {
    const subject = `Your ${clientName} infrastructure delegate sign-in link`;
    return {
      subject,
      html: frame({
        eyebrow: `${clientName} - infrastructure delegation`,
        heading: 'Secure delegate sign-in',
        intro: `Hello ${displayName}. A tenant director requested a secure sign-in link for your active infrastructure delegation.`,
        actionLabel: 'Sign in to delegated access',
        actionUrl: input.actionUrl,
        detailHtml: details,
        expiresIn: input.expiresIn
      }),
      text: `${subject}\n\nAssigned scope: ${scopesText}\n\nSign in: ${input.actionUrl}`
    };
  }

  const subject = `Your ${clientName} Portfolio Signals sign-in link`;
  return {
    subject,
    html: frame({
      eyebrow: `${clientName} - Portfolio Signals`,
      heading: 'Secure tenant workspace sign-in',
      intro: `Hello ${displayName}. Use this one-time link to continue to the ${clientName} workspace as ${input.role || 'an authorized tenant member'}.`,
      actionLabel: 'Sign in to tenant workspace',
      actionUrl: input.actionUrl,
      expiresIn: input.expiresIn
    }),
    text: `${subject}\n\nHello ${displayName}. Sign in: ${input.actionUrl}\n\nRole: ${input.role || 'authorized tenant member'}.`
  };
}

// Provenance: Notion Sprint 001 Hub + Loop 805 Slice AGI-AUTH-DELEGATES + Hash: 8e2d66e30c2a77967a3c0aa064c24422eedfac59
