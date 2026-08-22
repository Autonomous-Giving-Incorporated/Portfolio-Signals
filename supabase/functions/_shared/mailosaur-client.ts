// Pure Mailosaur helpers plus a thin REST client. No SDK dependency.
// Live calls are optional and must stay out of the default CI suite.

export const MAILOSAUR_API_BASE = 'https://mailosaur.com/api';
export const DEFAULT_MAILOSAUR_SERVER_ID = 'qpbqeifu';

const TOKEN_QUERY = /(?:token_hash|token|access_token)=[^&\s"'<>]+/gi;
const ACTION_URL = /https?:\/\/[^\s"'<>]+(?:token_hash|token|type=magiclink|type=invite)[^\s"'<>]*/gi;
const LEGACY_PALETTE = /#123f36|#19734a|#f4f7f6/i;

export type MailosaurEnv = {
  MAILOSAUR_API_KEY?: string;
  MAILOSAUR_SERVER_ID?: string;
};

export type AuthEmailCopy = {
  subject: string;
  html: string;
  text: string;
};

export type RedactedAuthEmail = AuthEmailCopy & { id?: string };

export type AuthEmailSummary = {
  audienceHint: 'platform_admin' | 'tenant_admin' | 'tenant_member' | 'delegate_invite' | 'delegate' | 'unknown';
  hasGoldAccent: boolean;
  hasCarbonAction: boolean;
  hasLegacyPalette: boolean;
  actionUrlPresent: boolean;
};

export type MailosaurServer = { id: string; name: string };

export type MailosaurClientOptions = {
  apiKey: string;
  serverId: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  baseUrl?: string;
};

export type WaitOptions = {
  timeoutMs?: number;
  intervalMs?: number;
  receivedAfter?: Date | string;
};

function requirePart(value: string, code: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(code);
  return trimmed;
}

export function inboxAddress(serverId: string, localPart: string): string {
  const server = requirePart(serverId, 'server_id_required').toLowerCase();
  const local = requirePart(localPart, 'local_part_required').toLowerCase();
  return `${local}@${server}.mailosaur.net`;
}

export function basicAuthHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`, 'utf8').toString('base64')}`;
}

export function isMailosaurConfigured(env: MailosaurEnv = process.env): boolean {
  return Boolean(env.MAILOSAUR_API_KEY?.trim() && env.MAILOSAUR_SERVER_ID?.trim());
}

export function extractActionUrl(input: AuthEmailCopy): string | null {
  const fromHtml = input.html.match(ACTION_URL)?.[0];
  const fromText = input.text.match(ACTION_URL)?.[0];
  return fromHtml || fromText || null;
}

export function redactAuthEmailMessage(input: AuthEmailCopy & { id?: string }): RedactedAuthEmail {
  const redact = (value: string) => value
    .replace(ACTION_URL, '[redacted-action-url]')
    .replace(TOKEN_QUERY, '[redacted-token]');
  return {
    id: input.id,
    subject: input.subject,
    html: redact(input.html),
    text: redact(input.text)
  };
}

export function summarizeAuthEmail(input: AuthEmailCopy): AuthEmailSummary {
  const subject = input.subject.toLowerCase();
  let audienceHint: AuthEmailSummary['audienceHint'] = 'unknown';
  if (subject.includes('platform administrator')) audienceHint = 'platform_admin';
  else if (subject.includes('tenant administrator')) audienceHint = 'tenant_admin';
  else if (subject.includes('invited you as an infrastructure delegate')) audienceHint = 'delegate_invite';
  else if (subject.includes('infrastructure delegate sign-in')) audienceHint = 'delegate';
  else if (subject.includes('portfolio signals sign-in')) audienceHint = 'tenant_member';

  const html = input.html;
  return {
    audienceHint,
    hasGoldAccent: /#e6b23c/i.test(html),
    hasCarbonAction: /#0e1116/i.test(html),
    hasLegacyPalette: LEGACY_PALETTE.test(html),
    actionUrlPresent: /https?:\/\/[^\s"'<>]+(?:token_hash|token|type=magiclink|type=invite)/i.test(input.html)
      || /https?:\/\/[^\s"'<>]+(?:token_hash|token|type=magiclink|type=invite)/i.test(input.text)
  };
}

export function assertBrandedAuthEmail(input: AuthEmailCopy) {
  const redacted = redactAuthEmailMessage(input);
  if (LEGACY_PALETTE.test(redacted.html) || LEGACY_PALETTE.test(redacted.text)) {
    throw new Error('legacy palette');
  }
  if (!/#e6b23c/i.test(redacted.html)) throw new Error('missing gold accent');
  if (!/#0e1116/i.test(redacted.html)) throw new Error('missing carbon action');
  if (ACTION_URL.test(redacted.html) || ACTION_URL.test(redacted.text)) {
    throw new Error('action url leaked');
  }
}

async function defaultSleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function createMailosaurClient(opts: MailosaurClientOptions) {
  const fetchImpl = opts.fetchImpl || fetch;
  const sleep = opts.sleep || defaultSleep;
  const baseUrl = opts.baseUrl || MAILOSAUR_API_BASE;
  const headers = {
    authorization: basicAuthHeader(opts.apiKey),
    accept: 'application/json',
    'content-type': 'application/json'
  };

  async function request(path: string, init: RequestInit = {}) {
    const response = await fetchImpl(`${baseUrl}${path}`, { ...init, headers: { ...headers, ...init.headers } });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`mailosaur_http_${response.status}`);
    }
    return text ? JSON.parse(text) : null;
  }

  return {
    async listServers(): Promise<MailosaurServer[]> {
      const payload = await request('/servers');
      const items = Array.isArray(payload?.items) ? payload.items : [];
      return items.map((item: { id?: string; name?: string }) => ({
        id: String(item.id || ''),
        name: String(item.name || '')
      }));
    },

    async createMessage(input: { to?: string; subject: string; html?: string; text?: string; send?: boolean }) {
      return request(`/messages?server=${encodeURIComponent(opts.serverId)}`, {
        method: 'POST',
        body: JSON.stringify({
          to: input.to,
          subject: input.subject,
          html: input.html,
          text: input.text,
          send: input.send === true
        })
      });
    },

    async searchMessages(sentTo: string, receivedAfter?: Date | string) {
      const params = new URLSearchParams({ server: opts.serverId });
      if (receivedAfter) {
        const iso = receivedAfter instanceof Date ? receivedAfter.toISOString() : receivedAfter;
        params.set('receivedAfter', iso);
      }
      return request(`/messages/search?${params}`, {
        method: 'POST',
        body: JSON.stringify({ sentTo })
      });
    },

    async getRawMessage(id: string): Promise<AuthEmailCopy & { id?: string }> {
      const payload = await request(`/messages/${encodeURIComponent(id)}`);
      return {
        id: String(payload?.id || id),
        subject: String(payload?.subject || ''),
        html: String(payload?.html?.body ?? payload?.html ?? ''),
        text: String(payload?.text?.body ?? payload?.text ?? '')
      };
    },

    async getMessage(id: string): Promise<RedactedAuthEmail> {
      return redactAuthEmailMessage(await this.getRawMessage(id));
    },

    async deleteMessage(id: string) {
      await request(`/messages/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },

    async waitForRawMessage(sentTo: string, wait: WaitOptions = {}): Promise<AuthEmailCopy & { id?: string }> {
      const timeoutMs = wait.timeoutMs ?? 20_000;
      const intervalMs = wait.intervalMs ?? 1_000;
      const start = Date.now();
      while (Date.now() - start <= timeoutMs) {
        const found = await this.searchMessages(sentTo, wait.receivedAfter);
        const first = Array.isArray(found?.items) ? found.items[0] : null;
        if (first?.id) return this.getRawMessage(String(first.id));
        await sleep(intervalMs);
      }
      throw new Error('mailosaur_timeout');
    },

    async waitForMessage(sentTo: string, wait: WaitOptions = {}): Promise<RedactedAuthEmail> {
      return redactAuthEmailMessage(await this.waitForRawMessage(sentTo, wait));
    }
  };
}

// Provenance: Mailosaur synthetic auth-email probe — no secrets in tree
