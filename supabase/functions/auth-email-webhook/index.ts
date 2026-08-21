import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { eventToDeliveryStatus, providerMessageId, verifyResendWebhook } from './lib.ts';

type JsonRecord = Record<string, unknown>;

function json(body: JsonRecord, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
}

// Resend delivery webhook. Deploy with --no-verify-jwt: authentication is the
// Svix signature (RESEND_WEBHOOK_SECRET), not a Supabase JWT. The request body
// and event payload are never logged (they contain the recipient address); only
// the provider message id is used, and only hashes/ids are persisted.
Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret || !supabaseUrl || !serviceKey) return json({ error: 'function_not_configured' }, 503);

  const body = await request.text();
  const verified = await verifyResendWebhook(secret, request.headers, body);
  if (!verified) return json({ error: 'invalid_signature' }, 401);

  let event: JsonRecord;
  try {
    event = JSON.parse(body);
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const status = eventToDeliveryStatus(String(event.type || ''));
  if (!status) return json({ received: true, ignored: true }, 200);

  const messageId = providerMessageId(event);
  if (!messageId) return json({ received: true, unmatched: true }, 200);

  const occurredAt = typeof event.created_at === 'string' ? event.created_at : null;
  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const result = await service.rpc('record_auth_email_delivery', {
    p_provider_message_id: messageId,
    p_delivery_status: status,
    p_occurred_at: occurredAt
  });
  if (result.error) return json({ error: 'delivery_record_failed' }, 500);

  return json({ received: true, updated: result.data ?? 0 }, 200);
});

// Provenance: auth-email hardening — Resend delivery feedback loop
