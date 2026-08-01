import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT || 8787);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function insertBatch(payload, token) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/import_batches`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
      'x-requested-by-user': token,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`batch_insert_failed:${response.status}`);
  return response.json();
}

http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/v1/import-batches') return send(res, 404, { error: 'not_found' });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return send(res, 503, { error: 'server_misconfigured' });

  const actor = req.headers['x-authenticated-user'];
  if (!actor) return send(res, 401, { error: 'authenticated_user_required' });

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks);
  if (raw.length > 5_000_000) return send(res, 413, { error: 'payload_too_large' });

  let body;
  try { body = JSON.parse(raw.toString('utf8')); } catch { return send(res, 400, { error: 'invalid_json' }); }
  if (!body.source_sha256 || !Array.isArray(body.rows)) return send(res, 400, { error: 'invalid_parser_receipt' });

  const canonical = JSON.stringify(body.rows);
  const computed = crypto.createHash('sha256').update(canonical).digest('hex');
  const receipt = {
    source_filename: body.source_filename || 'native-workbook.xlsx',
    source_sha256: body.source_sha256,
    parsed_rows_sha256: computed,
    row_count: body.rows.length,
    parser_version: body.parser_version || 'unknown',
    state: 'quarantined',
    created_by: actor,
  };

  try {
    const created = await insertBatch(receipt, actor);
    return send(res, 201, { batch: created[0], promotion_authorized: false });
  } catch (error) {
    return send(res, 502, { error: String(error.message || error) });
  }
}).listen(PORT, () => console.log(`import API listening on ${PORT}`));
