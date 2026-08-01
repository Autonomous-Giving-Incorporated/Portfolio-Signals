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

  const { data: profile } = await userClient.from('profiles').select('role,active').single();
  if (!profile?.active || !['director','campaign_lead','development','data_steward','auditor'].includes(profile.role)) {
    return json({ error: 'forbidden' }, 403);
  }

  const { documentId } = await req.json().catch(() => ({}));
  if (!documentId) return json({ error: 'document_id_required' }, 400);

  const admin = createClient(url, serviceKey);
  const { data: doc, error: docError } = await admin.from('private_documents')
    .select('storage_path')
    .eq('id', documentId)
    .single();
  if (docError || !doc) return json({ error: 'not_found' }, 404);

  const { data, error } = await admin.storage.from('campaign-private').createSignedUrl(doc.storage_path, 60);
  if (error) return json({ error: 'signing_failed' }, 500);

  await admin.from('audit_log').insert({
    actor_id: userData.user.id,
    action: 'signed_document_url_created',
    entity_type: 'private_document',
    entity_id: String(documentId),
    after_state: { ttl_seconds: 60 },
  });

  return json({ signedUrl: data.signedUrl, expiresIn: 60 });
});
