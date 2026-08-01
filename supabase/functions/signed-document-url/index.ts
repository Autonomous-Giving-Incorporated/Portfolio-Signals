import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, 401);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json({ error: 'server_misconfigured' }, 500);

  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return json({ error: 'unauthorized' }, 401);

  const { data: profile } = await userClient
    .from('profiles')
    .select('role,active')
    .eq('id', userData.user.id)
    .single();
  if (!profile?.active || !['director','campaign_lead','development','data_steward','auditor'].includes(profile.role)) {
    return json({ error: 'forbidden' }, 403);
  }

  const { documentId, expiresIn = 60 } = await req.json().catch(() => ({}));
  if (!documentId) return json({ error: 'document_id_required' }, 400);
  if (!Number.isInteger(expiresIn) || expiresIn < 30 || expiresIn > 300) {
    return json({ error: 'invalid_expiry' }, 400);
  }

  const { data: access, error: accessError } = await userClient.rpc('record_document_access', {
    p_document_id: documentId,
    p_ttl_seconds: expiresIn,
  });
  if (accessError) {
    const notFound = accessError.message?.includes('document_not_found');
    return json({ error: notFound ? 'not_found' : 'access_denied' }, notFound ? 404 : 403);
  }
  if (!access?.audit_id || !access?.storage_bucket || !access?.storage_path) {
    return json({ error: 'audit_failed' }, 500);
  }

  const admin = createClient(url, serviceKey);
  const { data, error } = await admin.storage
    .from(access.storage_bucket)
    .createSignedUrl(access.storage_path, expiresIn);
  if (error) return json({ error: 'signing_failed' }, 500);

  return json({ signedUrl: data.signedUrl, expiresIn, expiresAt: access.expires_at });
});
