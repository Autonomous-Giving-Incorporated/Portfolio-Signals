#!/usr/bin/env node
// Optional live probe: Mailosaur inbox + platform auth-email. Skips without
// MAILOSAUR_API_KEY. Never prints API keys, magic-link URLs, or tokens.
import {
  DEFAULT_MAILOSAUR_SERVER_ID,
  createMailosaurClient,
  extractActionUrl,
  inboxAddress,
  summarizeAuthEmail
} from '../../supabase/functions/_shared/mailosaur-client.ts';

const PLATFORM_FUNCTIONS = 'https://utdioxwiskzatwoejgiu.supabase.co/functions/v1';
const WORKSPACE = 'https://autogive.app/portfolio-signals/workspace';

function report(record: Record<string, unknown>) {
  console.log(JSON.stringify(record, null, 2));
}

async function connectivity(client: ReturnType<typeof createMailosaurClient>, sentTo: string) {
  const subject = `AGI Mailosaur connectivity ${Date.now()}`;
  await client.createMessage({
    to: sentTo,
    subject,
    html: '<p style="border-top:4px solid #e6b23c">Autonomously Giving Incorporated</p><td bgcolor="#0e1116">probe</td>',
    text: 'connectivity probe — no auth token',
    send: false
  });
  const message = await client.waitForMessage(sentTo, { timeoutMs: 15_000, intervalMs: 500 });
  if (message.subject !== subject) throw new Error('connectivity_subject_mismatch');
  if (message.id) await client.deleteMessage(message.id);
  return { ok: true, subjectMatched: true };
}

async function consumeMagicLink(url: string) {
  const hops: Array<{ status: number; host: string | null; path: string | null }> = [];
  let current = url;
  for (let i = 0; i < 5; i += 1) {
    const response = await fetch(current, {
      redirect: 'manual',
      headers: { 'user-agent': 'agi-p8-probe/1.0' }
    });
    const location = response.headers.get('location') || '';
    let host: string | null = null;
    let path: string | null = null;
    try {
      const parsed = new URL(location, current);
      host = parsed.host;
      path = parsed.pathname;
      current = parsed.href;
    } catch {
      current = '';
    }
    hops.push({ status: response.status, host, path });
    if (!(response.status >= 300 && response.status < 400) || !current) break;
  }
  const last = hops[hops.length - 1] || { status: 0, host: null, path: null };
  return {
    hops: hops.length,
    firstStatus: hops[0]?.status ?? null,
    lastStatus: last.status,
    lastHost: last.host,
    lastPath: last.path,
    reachedWorkspace: hops.some((hop) => hop.host === 'autogive.app'
      || (hop.path || '').includes('/portfolio-signals/'))
  };
}

async function probeUnsignedWebhook() {
  const response = await fetch(`${PLATFORM_FUNCTIONS}/auth-email-webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'agi-p8-probe/1.0' },
    body: JSON.stringify({ type: 'email.delivered' })
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, error: body?.error ?? null };
}

async function requestMagicLink(email: string, anonKey: string) {
  const response = await fetch(`${PLATFORM_FUNCTIONS}/auth-email`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      'content-type': 'application/json',
      origin: 'https://autogive.app'
    },
    body: JSON.stringify({
      action: 'self_sign_in',
      email,
      redirect_to: WORKSPACE
    })
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, accepted: body?.accepted === true, error: body?.error ?? null };
}

async function main() {
  const apiKey = process.env.MAILOSAUR_API_KEY?.trim();
  if (!apiKey) {
    report({ status: 'skipped', reason: 'MAILOSAUR_API_KEY unset' });
    process.exit(0);
  }

  const serverId = process.env.MAILOSAUR_SERVER_ID?.trim() || DEFAULT_MAILOSAUR_SERVER_ID;
  const client = createMailosaurClient({ apiKey, serverId });
  const servers = await client.listServers();
  const named = servers.find((server) => server.id === serverId);

  const connectAddress = inboxAddress(serverId, `agi-connect-${Date.now()}`);
  const connect = await connectivity(client, connectAddress);

  let magicLink: Record<string, unknown> = { status: 'skipped', reason: 'SUPABASE_ANON_KEY unset' };
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim() || process.env.PLATFORM_SUPABASE_ANON_KEY?.trim();
  if (anonKey) {
    const assigned = process.env.MAILOSAUR_ASSIGNED_EMAIL?.trim().toLowerCase();
    const recipient = assigned || inboxAddress(serverId, `p8-unassigned-${Date.now()}`);
    if (assigned && !assigned.endsWith(`@${serverId}.mailosaur.net`)) {
      throw new Error('assigned_email_must_use_mailosaur_inbox');
    }
    const requestedAt = new Date();
    const requested = await requestMagicLink(recipient, anonKey);
    let delivery: Record<string, unknown> = { status: 'pending' };
    try {
      const raw = await client.waitForRawMessage(recipient, {
        timeoutMs: 25_000,
        intervalMs: 2_000,
        receivedAfter: requestedAt
      });
      const summary = summarizeAuthEmail(raw);
      const actionUrl = extractActionUrl(raw);
      let click: Record<string, unknown> = { status: 'skipped', reason: 'no_action_url' };
      if (actionUrl) {
        click = { status: 'consumed', ...await consumeMagicLink(actionUrl) };
      }
      delivery = {
        status: 'delivered',
        audienceHint: summary.audienceHint,
        hasGoldAccent: summary.hasGoldAccent,
        hasCarbonAction: summary.hasCarbonAction,
        hasLegacyPalette: summary.hasLegacyPalette,
        actionUrlPresent: summary.actionUrlPresent,
        click
      };
      if (raw.id) await client.deleteMessage(raw.id);
    } catch (error) {
      delivery = {
        status: 'no_delivery',
        reason: error instanceof Error ? error.message : 'unknown',
        note: 'Unassigned addresses and missing Resend secrets both end in HTTP 202 with no provider send.'
      };
    }
    magicLink = {
      http: requested,
      recipientLocalPart: recipient.split('@')[0],
      delivery
    };
  }

  report({
    status: 'ok',
    server: { id: serverId, name: named?.name || null, knownServers: servers.length },
    connectivity: connect,
    magicLink,
    webhook: await probeUnsignedWebhook()
  });
}

main().catch((error) => {
  report({ status: 'error', error: error instanceof Error ? error.message : 'unknown' });
  process.exit(1);
});
