// Pure helpers for the Resend delivery webhook. Extracted so signature
// verification and event mapping are unit-testable without the Deno.serve handler.

const DELIVERY_BY_EVENT: Record<string, string> = {
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.delivery_delayed': 'delayed'
};

/** Map a Resend event type to a dispatch delivery status, or null to ignore. */
export function eventToDeliveryStatus(type: string): string | null {
  return DELIVERY_BY_EVENT[type] ?? null;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Constant-time string comparison to avoid signature timing leaks. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Compute the Svix/Resend base64 HMAC-SHA256 signature for signed content. */
export async function computeSvixSignature(secret: string, signedContent: string): Promise<string> {
  const key = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    base64ToBytes(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(signedContent));
  return bytesToBase64(new Uint8Array(mac));
}

/**
 * Verify a Resend (Svix) webhook signature over the raw request body.
 * Rejects missing headers, out-of-tolerance timestamps (replay), and mismatches.
 * `nowMs` is injectable for deterministic tests.
 */
export async function verifyResendWebhook(
  secret: string,
  headers: Headers,
  body: string,
  nowMs: number = Date.now()
): Promise<boolean> {
  const id = headers.get('svix-id');
  const timestamp = headers.get('svix-timestamp');
  const signatureHeader = headers.get('svix-signature');
  if (!secret || !id || !timestamp || !signatureHeader) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(nowMs / 1000 - ts) > 300) return false; // 5-minute replay window

  let expected: string;
  try {
    expected = await computeSvixSignature(secret, `${id}.${timestamp}.${body}`);
  } catch {
    return false;
  }

  // Header is a space-separated list of "v1,<base64sig>" entries.
  const provided = signatureHeader
    .split(' ')
    .map((part) => (part.includes(',') ? part.slice(part.indexOf(',') + 1) : part))
    .filter(Boolean);
  return provided.some((candidate) => timingSafeEqual(candidate, expected));
}

/** Extract the provider message id from a Resend event payload. */
export function providerMessageId(event: unknown): string {
  const data = (event as { data?: Record<string, unknown> } | null)?.data ?? {};
  const id = data.email_id ?? data.id ?? '';
  return typeof id === 'string' ? id : '';
}

// Hard delivery failures worth alerting operators about (delivered/delayed are not).
const ALERT_STATUSES = new Set(['bounced', 'complained']);

/** Whether a delivery outcome should raise an operator alert. */
export function shouldAlert(deliveryStatus: string): boolean {
  return ALERT_STATUSES.has(deliveryStatus);
}

/**
 * Build a redacted alert message for a channel-agnostic incoming webhook
 * (Slack / Buzz / Discord / Teams all accept a `text` field). Never includes a
 * recipient address — only the dispatch kind, reason, id, and time.
 */
export function buildAlertPayload(input: {
  kind?: string | null;
  reason: string;
  dispatchRef?: string | null;
  occurredAt?: string | null;
}): { text: string } {
  const kind = input.kind || 'unknown';
  const when = input.occurredAt || new Date().toISOString();
  const ref = input.dispatchRef || 'unknown';
  const priority = kind === 'platform_admin_magic_link' ? ' (platform admin)' : '';
  return {
    text: `AGI auth email ${input.reason}${priority}: kind=${kind}, ref=${ref}, at=${when}. See auth_email_alerts for details.`
  };
}
