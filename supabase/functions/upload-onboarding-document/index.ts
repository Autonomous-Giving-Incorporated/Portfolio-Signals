import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

// Keep classify rules aligned with services/onboarding-pack/src/classifier.mjs
// (and template.mjs ALLOWED_MIME / PARK_MIME / PARK_EXT). Duplicate intentionally
// for Deno edge packaging — do not import from services/.

const BUCKET = 'campaign-private';
const MAX_BYTES = 26214400;
const CLASSIFIER_VERSION = 'v1-heuristics';

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const PARK_MIME = new Set([
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const PARK_EXT = new Set(['.csv', '.xls', '.xlsx']);

const ALLOWED_EXT = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.docx', '.txt'];

// Same RULES table as services/onboarding-pack/src/classifier.mjs
const RULES: Array<{ type: string; re: RegExp; confidence: number }> = [
  { type: 'governance', re: /bylaw|articles\s*of|constitution/i, confidence: 0.85 },
  { type: 'tax_exempt_or_ein', re: /\bein\b|501\s*\(?\s*c\s*\)?\s*3|tax[-_ ]?exempt|determination/i, confidence: 0.85 },
  { type: 'org_legal_name_proof', re: /formation|articles\s*of\s*incorp|certificate\s*of|sos[_-]?filing/i, confidence: 0.8 },
  { type: 'brand_logo', re: /logo|wordmark|icon/i, confidence: 0.8 },
  { type: 'primary_contact', re: /contact|ops[_-]?card|primary[_-]?contact/i, confidence: 0.75 },
  { type: 'w9', re: /\bw[-_]?9\b/i, confidence: 0.9 },
  { type: 'board_list', re: /board[-_ ]?(list|roster|members)/i, confidence: 0.8 },
  { type: 'brand_kit', re: /brand[-_ ]?kit|style[-_ ]?guide|letterhead/i, confidence: 0.8 },
  { type: 'campaign_brief', re: /campaign[-_ ]?brief|program[-_ ]?brief/i, confidence: 0.75 },
  { type: 'impact_sample', re: /impact|annual[-_ ]?report/i, confidence: 0.7 },
];

const MIME_FROM_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Classification = {
  suggested_type: string;
  confidence: number;
  status: 'stored' | 'parked_crm' | 'rejected';
  reject_reason?: string;
  classifier_version: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

function safeName(name: string) {
  return name
    .toLowerCase()
    .replace(/\.\./g, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96) || 'document';
}

function extOf(filename: string) {
  const m = String(filename || '').toLowerCase().match(/(\.[a-z0-9]+)$/);
  return m ? m[1] : '';
}

/** Mirrors services/onboarding-pack/src/classifier.mjs — keep behavior aligned. */
function classify({ filename, mimeType }: { filename: string; mimeType: string }): Classification {
  const name = String(filename || '');
  const mime = String(mimeType || '');
  const ext = extOf(name);

  if (PARK_MIME.has(mime) || PARK_EXT.has(ext)) {
    return {
      suggested_type: 'parked_crm',
      confidence: 1,
      status: 'parked_crm',
      classifier_version: CLASSIFIER_VERSION,
    };
  }

  const mimeOk = ALLOWED_MIME.has(mime) || ALLOWED_EXT.includes(ext);
  if (!mimeOk) {
    return {
      suggested_type: 'uncategorized',
      confidence: 0,
      status: 'rejected',
      reject_reason: 'disallowed_type',
      classifier_version: CLASSIFIER_VERSION,
    };
  }

  for (const rule of RULES) {
    if (rule.re.test(name)) {
      return {
        suggested_type: rule.type,
        confidence: rule.confidence,
        status: 'stored',
        classifier_version: CLASSIFIER_VERSION,
      };
    }
  }

  return {
    suggested_type: 'uncategorized',
    confidence: 0,
    status: 'stored',
    classifier_version: CLASSIFIER_VERSION,
  };
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
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

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { authorization } },
    auth: { persistSession: false },
  });
  const serviceClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'invalid_user_token' }, 401);

  const form = await request.formData();
  const clientId = String(form.get('client_id') || '').trim();
  const file = form.get('document');

  if (!clientId) return json({ error: 'client_id_required' }, 400);
  if (!(file instanceof File)) return json({ error: 'document_file_required' }, 400);
  if (file.size <= 0 || file.size > MAX_BYTES) return json({ error: 'invalid_document_size' }, 400);

  // 1–3: AuthZ via can_manage_onboarding_pack (active + mfa_enforced + director|master)
  const { data: canManage, error: manageError } = await userClient.rpc('can_manage_onboarding_pack', {
    p_client_id: clientId,
  });
  if (manageError) return json({ error: manageError.message }, 403);
  if (canManage !== true) return json({ error: 'onboarding_pack_forbidden' }, 403);

  const originalFilename = file.name || 'document';
  const ext = extOf(originalFilename);
  const mimeType = (file.type && file.type.trim()) || MIME_FROM_EXT[ext] || 'application/octet-stream';

  // 4–5: Hash + classify; reject before any storage write
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = await sha256Hex(bytes);
  const classification = classify({ filename: originalFilename, mimeType });

  if (classification.status === 'rejected') {
    return json({
      error: 'document_rejected',
      reject_reason: classification.reject_reason || 'disallowed_type',
      classification,
    }, 400);
  }

  // 6–7: Path onboarding/<client_id>/<document_id>/<safe_filename>; document_id lowercase UUID
  const docId = crypto.randomUUID().toLowerCase();
  const filename = safeName(originalFilename);
  const storagePath = `onboarding/${clientId}/${docId}/${filename}`;

  const upload = await serviceClient.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: mimeType,
    cacheControl: '3600',
    upsert: false,
  });
  if (upload.error) return json({ error: upload.error.message }, 500);

  // 8: Register via service_role with p_uploaded_by (RPC is service_role only)
  const registered = await serviceClient.rpc('register_onboarding_document', {
    p_client_id: clientId,
    p_storage_path: storagePath,
    p_original_filename: originalFilename,
    p_mime_type: mimeType,
    p_byte_size: file.size,
    p_sha256: sha256,
    p_suggested_type: classification.suggested_type,
    p_suggested_confidence: classification.confidence,
    p_classifier_version: classification.classifier_version,
    p_status: classification.status,
    p_uploaded_by: userData.user.id,
  });

  if (registered.error) {
    await serviceClient.storage.from(BUCKET).remove([storagePath]);
    return json({ error: registered.error.message, compensated: true }, 400);
  }

  // sha256 dedupe: RPC returns existing row; remove orphan object if path differs
  const document = registered.data as { storage_path?: string } | null;
  if (document?.storage_path && document.storage_path !== storagePath) {
    await serviceClient.storage.from(BUCKET).remove([storagePath]);
  }

  return json({ document: registered.data, classification });
});
