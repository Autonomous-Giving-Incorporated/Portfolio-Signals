export type AuthEmailAudience =
  | 'platform_admin'
  | 'tenant_admin'
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

// AGI brand tokens (styles.css :root). Email cannot use CSS variables, so the
// canonical palette is inlined here. Keep in sync with the design system.
const COLOR = {
  paper: '#f7f8fa',
  surface: '#ffffff',
  surfaceAlt: '#e6e9ec',
  ink: '#0e1116',
  graphite: '#1f232b',
  muted: '#5b646f',
  line: '#cfd5d9',
  carbon: '#0e1116', // primary action / masthead
  teal: '#1f5f52', // suite navigation / verified / links
  mint: '#a5cbb8',
  gold: '#e6b23c' // attention / focus accent
} as const;

// Brand type stacks. Auth email is intentionally self-contained (no external
// font or image loads) for deliverability and recipient privacy; brand faces
// apply only where already installed, otherwise the system fallbacks render.
const FONT_DISPLAY = "'Space Grotesk', 'Segoe UI', Arial, sans-serif";
const FONT_BODY = "'Inter', 'Segoe UI', Arial, sans-serif";
const FONT_MONO = "'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace";

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

// A left-accented callout used for boundary notes and assigned-scope lists.
function callout(bodyHtml: string) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 4px">
              <tr><td style="padding:14px 16px;background:${COLOR.surfaceAlt};border-left:3px solid ${COLOR.teal};border-radius:4px;font-size:13px;line-height:1.55;color:${COLOR.graphite}">${bodyHtml}</td></tr>
            </table>`;
}

function scopeCallout(labels: string[]) {
  if (!labels.length) return '';
  const items = labels
    .map((label) => `<li style="margin:2px 0">${escapeHtml(label)}</li>`)
    .join('');
  return callout(
    `<strong style="display:block;font-family:${FONT_MONO};font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${COLOR.teal};margin-bottom:6px">Assigned infrastructure scope</strong><ul style="margin:0;padding-left:18px">${items}</ul>`
  );
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
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light only">
    <meta name="supported-color-schemes" content="light">
    <style>
      body { margin: 0; padding: 0; background: ${COLOR.paper}; }
      a { color: ${COLOR.teal}; }
      @media (max-width: 620px) {
        .agi-card { width: 100% !important; border-radius: 0 !important; }
        .agi-pad { padding: 24px !important; }
      }
    </style>
  </head>
  <body style="margin:0;background:${COLOR.paper};color:${COLOR.ink};font-family:${FONT_BODY}">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${COLOR.paper}">${escapeHtml(intro)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${COLOR.paper};padding:32px 16px">
      <tr><td align="center">
        <table role="presentation" class="agi-card" width="600" cellspacing="0" cellpadding="0" style="width:600px;max-width:600px;background:${COLOR.surface};border:1px solid ${COLOR.line};border-top:4px solid ${COLOR.gold};border-radius:4px;overflow:hidden">
          <tr><td style="padding:26px 32px;background:${COLOR.carbon}">
            <div style="font-family:${FONT_MONO};font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:${COLOR.gold}">${escapeHtml(eyebrow)}</div>
            <div style="font-family:${FONT_DISPLAY};font-size:15px;font-weight:700;letter-spacing:.01em;color:#ffffff;margin-top:12px">Autonomously Giving Incorporated</div>
            <div style="font-family:${FONT_MONO};font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${COLOR.mint};margin-top:4px">Portfolio Signals &middot; Decision Workspace</div>
          </td></tr>
          <tr><td class="agi-pad" style="padding:32px">
            <h1 style="margin:0 0 16px;font-family:${FONT_DISPLAY};font-size:22px;font-weight:700;line-height:1.25;color:${COLOR.ink}">${escapeHtml(heading)}</h1>
            <p style="margin:0 0 18px;line-height:1.6;font-size:15px;color:${COLOR.graphite}">${escapeHtml(intro)}</p>
            ${detailHtml}
            <table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0"><tr>
              <td align="center" bgcolor="${COLOR.carbon}" style="border-radius:2px">
                <a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:13px 22px;font-family:${FONT_DISPLAY};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:2px">${escapeHtml(actionLabel)}</a>
              </td>
            </tr></table>
            <p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:${COLOR.muted}">This one-time link expires in ${escapeHtml(expiresIn || '15 minutes')}. If you did not request or expect this email, do not use the link.</p>
            <p style="margin:10px 0 0;font-size:13px;line-height:1.5;color:${COLOR.muted}">Authentication grants system access only. It does not grant outreach, allocation, payment, or publication authority.</p>
          </td></tr>
          <tr><td style="padding:18px 32px;border-top:1px solid ${COLOR.surfaceAlt};background:${COLOR.surface}">
            <div style="font-family:${FONT_DISPLAY};font-size:13px;font-weight:700;color:${COLOR.ink}">A.G.I. Portfolio Signals</div>
            <div style="font-size:12px;line-height:1.5;color:${COLOR.muted};margin-top:5px">
              <a href="https://autogive.app/legal" style="color:${COLOR.teal};text-decoration:none;font-weight:700">Legal</a> &middot;
              <a href="https://autogive.app/legal/privacy" style="color:${COLOR.teal};text-decoration:none;font-weight:700">Privacy</a>
              &middot; Software by Zero State
            </div>
          </td></tr>
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

  if (input.audience === 'platform_admin') {
    const subject = 'Your A.G.I. platform administrator sign-in link';
    return {
      subject,
      html: frame({
        eyebrow: 'A.G.I. \u00b7 Platform administration',
        heading: 'Secure administrator sign-in',
        intro: `Hello ${displayName}. Use the button below to continue to the A.G.I. platform control plane.`,
        actionLabel: 'Sign in as platform administrator',
        actionUrl: input.actionUrl,
        detailHtml: callout(
          'Platform administration does not grant tenant-private access without an explicit tenant membership.'
        ),
        expiresIn: input.expiresIn
      }),
      text: `${subject}\n\nHello ${displayName}. Sign in: ${input.actionUrl}\n\nThis link is one-time and does not grant tenant-private access by itself.`
    };
  }

  if (input.audience === 'tenant_admin') {
    const subject = `Your ${clientName} tenant administrator sign-in link`;
    return {
      subject,
      html: frame({
        eyebrow: `${clientName} \u00b7 Tenant administration`,
        heading: 'Secure tenant administrator sign-in',
        intro: `Hello ${displayName}. Use this one-time link to administer the ${clientName} workspace as tenant director.`,
        actionLabel: 'Sign in as tenant director',
        actionUrl: input.actionUrl,
        detailHtml: callout(
          `<strong style="display:block;font-family:${FONT_MONO};font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${COLOR.teal};margin-bottom:6px">Tenant director authority</strong>As director you can invite and revoke infrastructure delegates and manage client configuration for ${escapeHtml(clientName)}. This does not grant outreach, allocation, payment, or publication authority.`
        ),
        expiresIn: input.expiresIn
      }),
      text: `${subject}\n\nHello ${displayName}. Sign in: ${input.actionUrl}\n\nRole: tenant director for ${clientName}. Directors administer delegates and client configuration only; this grants no outreach, allocation, payment, or publication authority.`
    };
  }

  if (input.audience === 'delegate_invite') {
    const subject = `${clientName} invited you as an infrastructure delegate`;
    return {
      subject,
      html: frame({
        eyebrow: `${clientName} \u00b7 Infrastructure delegation`,
        heading: 'Accept delegated access',
        intro: `Hello ${displayName}. A tenant director for ${clientName} invited you to support approved infrastructure surfaces.`,
        actionLabel: 'Accept delegate invitation',
        actionUrl: input.actionUrl,
        detailHtml: scopeCallout(labels),
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
        eyebrow: `${clientName} \u00b7 Infrastructure delegation`,
        heading: 'Secure delegate sign-in',
        intro: `Hello ${displayName}. A tenant director requested a secure sign-in link for your active infrastructure delegation.`,
        actionLabel: 'Sign in to delegated access',
        actionUrl: input.actionUrl,
        detailHtml: scopeCallout(labels),
        expiresIn: input.expiresIn
      }),
      text: `${subject}\n\nAssigned scope: ${scopesText}\n\nSign in: ${input.actionUrl}`
    };
  }

  const subject = `Your ${clientName} Portfolio Signals sign-in link`;
  return {
    subject,
    html: frame({
      eyebrow: `${clientName} \u00b7 Portfolio Signals`,
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
