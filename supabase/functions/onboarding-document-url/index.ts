import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'content-type': 'application/json', 'cache-control': 'no-store' },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, 401);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json({ error: 'server_misconfigured' }, 500);

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return json({ error: 'unauthorized' }, 401);

  const { documentId, expiresIn = 60 } = await req.json().catch(() => ({}));
  if (!documentId) return json({ error: 'document_id_required' }, 400);
  if (!Number.isInteger(expiresIn) || expiresIn < 30 || expiresIn > 300) {
    return json({ error: 'invalid_expiry' }, 400);
  }

  // AuthZ + audit via RPC (can_manage_onboarding_pack); never expose storage path alone
  const { data: access, error: accessError } = await userClient.rpc('issue_onboarding_document_access', {
    p_document_id: documentId,
    p_ttl_seconds: expiresIn,
  });
  if (accessError) {
    const msg = accessError.message || '';
    if (msg.includes('onboarding_document_not_found')) return json({ error: 'not_found' }, 404);
    if (msg.includes('invalid_ttl')) return json({ error: 'invalid_expiry' }, 400);
    return json({ error: 'access_denied' }, 403);
  }
  if (!access?.audit_id || !access?.storage_bucket || !access?.storage_path) {
    return json({ error: 'audit_failed' }, 500);
  }

  const serviceClient = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
  const { data, error } = await serviceClient.storage
    .from(access.storage_bucket)
    .createSignedUrl(access.storage_path, expiresIn);
  if (error) return json({ error: 'signing_failed' }, 500);

  return json({
    signedUrl: data.signedUrl,
    expiresIn,
    expiresAt: access.expires_at,
  });
});
