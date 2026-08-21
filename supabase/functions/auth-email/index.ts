import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import {
  renderAuthEmail,
  type AuthEmailAudience,
  type AuthEmailTemplateInput
} from '../_shared/auth-email-templates.ts';
import {
  clientIp,
  createRateLimiter,
  normalizeEmail,
  parseAllowedOrigins,
  pickAllowedOrigin,
  safeRedirect
} from './lib.ts';

type JsonRecord = Record<string, unknown>;

const DEFAULT_REDIRECT = 'https://autogive.app/portfolio-signals/workspace';

// Production-safe by default: when AUTH_ALLOWED_ORIGINS is unset, only
// https://autogive.app is accepted (no localhost). Local development sets
// AUTH_ALLOWED_ORIGINS='https://autogive.app,http://127.0.0.1:8080'.
const ALLOWED_ORIGINS = parseAllowedOrigins(Deno.env.get('AUTH_ALLOWED_ORIGINS'));

// Best-effort coarse throttle for the unauthenticated self_sign_in path
// (requested_by is null there, so the per-requester DB cap does not apply).
// Durable per-identity limiting is a documented follow-up.
const SELF_SIGN_IN_PER_IP = createRateLimiter({ windowMs: 600_000, max: 5 });
const SELF_SIGN_IN_GLOBAL = createRateLimiter({ windowMs: 600_000, max: 300 });

function corsHeaders(request: Request) {
  return {
    'Access-Control-Allow-Origin': pickAllowedOrigin(request.headers.get('origin'), ALLOWED_ORIGINS),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

function json(request: Request, body: JsonRecord, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), 'content-type': 'application/json' }
  });
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sendWithResend(
  rendered: ReturnType<typeof renderAuthEmail>,
  email: string
) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('AUTH_EMAIL_FROM');
  if (!apiKey || !from) throw new Error('email_transport_not_configured');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: [email],
      reply_to: Deno.env.get('AUTH_EMAIL_REPLY_TO') || undefined,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      headers: { 'X-Entity-Ref-ID': crypto.randomUUID() }
    })
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(`email_provider_${response.status}`);
  return typeof payload?.id === 'string' ? payload.id : null;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return json(request, { error: 'method_not_allowed' }, 405);
  const origin = request.headers.get('origin');
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(request, { error: 'origin_not_allowed' }, 403);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json(request, { error: 'function_not_configured' }, 503);
  }

  let body: JsonRecord;
  try {
    body = await request.json();
  } catch {
    return json(request, { error: 'invalid_json' }, 400);
  }

  const action = String(body.action || '');
  const redirectTo = safeRedirect(body.redirect_to, ALLOWED_ORIGINS, DEFAULT_REDIRECT);
  const serviceClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const authorization = request.headers.get('authorization') || '';
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { authorization } },
    auth: { persistSession: false }
  });

  let email: string | null = null;
  let audience: AuthEmailAudience = 'tenant_member';
  let context: JsonRecord = {};
  let kind = 'tenant_member_magic_link';
  let requestedBy: string | null = null;
  let invitationId: string | null = null;

  if (action === 'self_sign_in') {
    const ip = clientIp(request.headers);
    if (!SELF_SIGN_IN_PER_IP.check(ip) || !SELF_SIGN_IN_GLOBAL.check('global')) {
      // Generic response: never reveal throttling or account existence.
      return json(request, { accepted: true }, 202);
    }
    email = normalizeEmail(body.email);
    if (!email) return json(request, { accepted: true }, 202);
    const resolved = await serviceClient.rpc('resolve_auth_email_context', { p_email: email });
    if (resolved.error || !resolved.data) return json(request, { accepted: true }, 202);
    context = resolved.data as JsonRecord;
    if (context.audience === 'unassigned') return json(request, { accepted: true }, 202);
    audience = context.audience === 'platform_admin'
      ? 'platform_admin'
      : context.audience === 'delegate'
        ? 'delegate'
        : 'tenant_member';
    kind = audience === 'platform_admin'
      ? 'platform_admin_magic_link'
      : audience === 'delegate'
        ? 'delegate_magic_link'
        : 'tenant_member_magic_link';
    // Tenant directors get a distinct tenant-administration template. The
    // dispatch record kind stays tenant_member_magic_link (enum unchanged).
    if (audience === 'tenant_member' && String(context.role || '') === 'director') {
      audience = 'tenant_admin';
    }
  } else {
    const user = await userClient.auth.getUser();
    if (user.error || !user.data.user) return json(request, { error: 'invalid_user_token' }, 401);
    requestedBy = user.data.user.id;

    if (action === 'invite_delegate') {
      email = normalizeEmail(body.email);
      if (!email) return json(request, { error: 'valid_delegate_email_required' }, 400);
      const invitation = await userClient.rpc('request_delegate_invitation', {
        p_client_id: String(body.client_id || ''),
        p_email: email,
        p_scopes: Array.isArray(body.scopes) ? body.scopes.map(String) : [],
        p_rationale: String(body.rationale || '')
      });
      if (invitation.error) return json(request, { error: invitation.error.message }, 403);
      context = invitation.data as JsonRecord;
      invitationId = String(context.id || '');
      const client = await serviceClient.from('clients').select('display_name').eq('id', context.client_id).single();
      if (client.error) return json(request, { error: 'client_context_unavailable' }, 500);
      context.client_name = client.data.display_name;
      context.display_name = email.split('@')[0];
      audience = 'delegate_invite';
      kind = 'delegate_invite';
    } else if (action === 'resend_delegate_sign_in') {
      const authorized = await userClient.rpc('authorize_delegate_sign_in', {
        p_client_id: String(body.client_id || ''),
        p_user_id: String(body.user_id || ''),
        p_rationale: String(body.rationale || '')
      });
      if (authorized.error) return json(request, { error: authorized.error.message }, 403);
      context = authorized.data as JsonRecord;
      const target = await serviceClient.auth.admin.getUserById(String(context.target_user_id || ''));
      email = normalizeEmail(target.data.user?.email);
      if (target.error || !email) return json(request, { error: 'delegate_email_unavailable' }, 409);
      const client = await serviceClient.from('clients').select('display_name').eq('id', context.client_id).single();
      if (client.error) return json(request, { error: 'client_context_unavailable' }, 500);
      context.client_name = client.data.display_name;
      context.display_name = target.data.user?.user_metadata?.display_name || email.split('@')[0];
      audience = 'delegate';
      kind = 'delegate_magic_link';
    } else {
      return json(request, { error: 'unsupported_action' }, 400);
    }
  }

  if (!email) return json(request, { accepted: true }, 202);
  const recipientHash = await sha256(email);
  const dispatch = await serviceClient.rpc('begin_auth_email_dispatch', {
    p_recipient_hash: recipientHash,
    p_kind: kind,
    p_client_id: context.client_id || null,
    p_target_user_id: context.target_user_id || context.user_id || null,
    p_requested_by: requestedBy
  });
  if (dispatch.error) return json(request, { error: 'email_dispatch_unavailable' }, 503);
  if (!dispatch.data) {
    return action === 'self_sign_in'
      ? json(request, { accepted: true }, 202)
      : json(request, { error: 'email_rate_limited' }, 429);
  }

  const invitationQuery = invitationId ? `delegate_invitation=${encodeURIComponent(invitationId)}` : '';
  const linkRedirect = invitationQuery
    ? `${redirectTo}${redirectTo.includes('?') ? '&' : '?'}${invitationQuery}`
    : redirectTo;
  const existing = await serviceClient.rpc('resolve_auth_email_context', { p_email: email });
  const linkType = action === 'invite_delegate' && !existing.data ? 'invite' : 'magiclink';
  const generated = await serviceClient.auth.admin.generateLink({
    type: linkType,
    email,
    options: { redirectTo: linkRedirect }
  });

  if (generated.error || !generated.data.properties?.action_link) {
    await serviceClient.rpc('complete_auth_email_dispatch', {
      p_dispatch_id: dispatch.data,
      p_status: 'failed',
      p_error_code: 'auth_link_generation_failed'
    });
    return action === 'self_sign_in'
      ? json(request, { accepted: true }, 202)
      : json(request, { error: 'auth_link_generation_failed' }, 502);
  }

  const templateInput: AuthEmailTemplateInput = {
    audience,
    actionUrl: generated.data.properties.action_link,
    displayName: String(context.display_name || ''),
    clientName: String(context.client_name || ''),
    role: String(context.role || ''),
    scopes: Array.isArray(context.scopes) ? context.scopes.map(String) : [],
    expiresIn: audience === 'delegate_invite' ? '72 hours' : '15 minutes'
  };

  try {
    const messageId = await sendWithResend(renderAuthEmail(templateInput), email);
    await serviceClient.rpc('complete_auth_email_dispatch', {
      p_dispatch_id: dispatch.data,
      p_status: 'sent',
      p_provider_message_id: messageId
    });
    if (invitationId) {
      await serviceClient.from('client_delegate_invitations').update({
        last_sent_at: new Date().toISOString(),
        send_count: Number(context.send_count || 0) + 1
      }).eq('id', invitationId);
    }
  } catch (error) {
    await serviceClient.rpc('complete_auth_email_dispatch', {
      p_dispatch_id: dispatch.data,
      p_status: 'failed',
      p_error_code: error instanceof Error ? error.message : 'email_send_failed'
    });
    return action === 'self_sign_in'
      ? json(request, { accepted: true }, 202)
      : json(request, { error: 'email_send_failed' }, 502);
  }

  return action === 'self_sign_in'
    ? json(request, { accepted: true }, 202)
    : json(request, { invitation_id: invitationId, status: 'sent' }, 200);
});

// Provenance: Notion Sprint 001 Hub + Loop 805 Slice AGI-AUTH-DELEGATES + Hash: 8e2d66e30c2a77967a3c0aa064c24422eedfac59
