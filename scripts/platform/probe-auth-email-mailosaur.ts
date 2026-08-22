#!/usr/bin/env node
// Optional live probe: Mailosaur inbox + platform auth-email. Skips without
// MAILOSAUR_API_KEY. Never prints API keys, magic-link URLs, or tokens.
import {
  DEFAULT_MAILOSAUR_SERVER_ID,
  createMailosaurClient,
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
      const message = await client.waitForMessage(recipient, {
        timeoutMs: 25_000,
        intervalMs: 2_000,
        receivedAfter: requestedAt
      });
      const summary = summarizeAuthEmail(message);
      delivery = {
        status: 'delivered',
        audienceHint: summary.audienceHint,
        hasGoldAccent: summary.hasGoldAccent,
        hasCarbonAction: summary.hasCarbonAction,
        hasLegacyPalette: summary.hasLegacyPalette,
        actionUrlPresent: summary.actionUrlPresent
      };
      if (message.id) await client.deleteMessage(message.id);
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
    magicLink
  });
}

main().catch((error) => {
  report({ status: 'error', error: error instanceof Error ? error.message : 'unknown' });
  process.exit(1);
});
