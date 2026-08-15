import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { jwtAssuranceLevel } from '../_shared/auth-assurance.ts';

const BUCKET = 'agi-public-assets';
const ALLOWED_KINDS = new Set(['logo', 'icon', 'hero', 'background', 'document']);
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'application/pdf']);
const MAX_BYTES = 10 * 1024 * 1024;
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
}
function safeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 96) || 'asset';
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: 'function_not_configured' }, 500);

  const authorization = request.headers.get('authorization') || '';
  if (!authorization.toLowerCase().startsWith('bearer ')) return json({ error: 'bearer_token_required' }, 401);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { authorization } }, auth: { persistSession: false } });
  const serviceClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'invalid_user_token' }, 401);
  const accessToken = authorization.slice(7).trim();
  // Read claims only after getUser() has validated this exact bearer token.
  if (jwtAssuranceLevel(accessToken) !== 'aal2') {
    return json({ error: 'aal2_session_required' }, 403);
  }

  const form = await request.formData();
  const clientId = String(form.get('client_id') || '');
  const assetKind = String(form.get('asset_kind') || '');
  const altText = String(form.get('alt_text') || '').slice(0, 160);
  const file = form.get('asset');
  if (!clientId || !ALLOWED_KINDS.has(assetKind)) return json({ error: 'invalid_asset_request' }, 400);
  if (!(file instanceof File)) return json({ error: 'asset_file_required' }, 400);
  if (!ALLOWED_MIME.has(file.type) || file.size <= 0 || file.size > MAX_BYTES) return json({ error: 'invalid_asset_file' }, 400);

  const { data: context, error: contextError } = await userClient.rpc('get_workspace_context');
  if (contextError) return json({ error: contextError.message }, 403);
  if (!context?.profile?.active || !context.profile.mfa_enforced) return json({ error: 'mfa_required' }, 403);
  const selected = (Array.isArray(context.clients) ? context.clients : []).find((client: { id: string; role?: string }) => client.id === clientId);
  if (selected?.role !== 'director') return json({ error: 'client_director_required' }, 403);

  const storagePath = `${clientId}/${userData.user.id}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const upload = await serviceClient.storage.from(BUCKET).upload(storagePath, bytes, { contentType: file.type, cacheControl: '3600', upsert: false });
  if (upload.error) return json({ error: upload.error.message }, 500);

  const registered = await serviceClient.rpc('register_client_asset', {
    p_client_id: clientId,
    p_storage_path: storagePath,
    p_asset_kind: assetKind,
    p_alt_text: altText,
    p_mime_type: file.type,
    p_byte_size: file.size,
    p_uploaded_by: userData.user.id
  });
  if (registered.error) {
    await serviceClient.storage.from(BUCKET).remove([storagePath]);
    return json({ error: registered.error.message, compensated: true }, 400);
  }
  return json({ asset: registered.data });
});
