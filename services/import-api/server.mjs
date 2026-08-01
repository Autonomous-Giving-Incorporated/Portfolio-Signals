import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT || 8787);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function send(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store'
  });
  res.end(JSON.stringify(body));
}

function isUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function insertBatch(payload) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/import_batches`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
      prefer: 'return=representation'
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`batch_insert_failed:${response.status}:${detail}`);
  }
  return response.json();
}

async function insertRows(rows) {
  if (!rows.length) return [];
  const response = await fetch(`${SUPABASE_URL}/rest/v1/import_staging_rows`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
      prefer: 'return=representation'
    },
    body: JSON.stringify(rows)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`row_insert_failed:${response.status}:${detail}`);
  }
  return response.json();
}

http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/v1/import-batches') {
    return send(res, 404, { error: 'not_found' });
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return send(res, 503, { error: 'server_misconfigured' });
  }

  const actor = req.headers['x-authenticated-user'];
  if (!actor || !isUuid(actor)) {
    return send(res, 401, { error: 'authenticated_user_required' });
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks);
  if (raw.length > 5_000_000) return send(res, 413, { error: 'payload_too_large' });

  let body;
  try {
    body = JSON.parse(raw.toString('utf8'));
  } catch {
    return send(res, 400, { error: 'invalid_json' });
  }

  if (!body.source_sha256 || !Array.isArray(body.rows)) {
    return send(res, 400, { error: 'invalid_parser_receipt' });
  }
  if (!/^[a-f0-9]{64}$/i.test(body.source_sha256)) {
    return send(res, 400, { error: 'invalid_source_sha256' });
  }

  const canonical = JSON.stringify(body.rows);
  const computed = crypto.createHash('sha256').update(canonical).digest('hex');
  const sourceName = body.source_filename || body.source_name || 'native-workbook.xlsx';
  const storagePath = body.storage_object_path
    || `quarantine/${body.source_sha256}/${sourceName}`;

  const batchPayload = {
    source_name: sourceName,
    source_sha256: body.source_sha256,
    source_received_at: body.source_received_at || new Date().toISOString(),
    row_count: body.rows.length,
    schema_version: body.schema_version || body.parser_version || 'parser-v1',
    state: 'received',
    storage_object_path: storagePath,
    submitted_by: actor,
    receipt: {
      parsed_rows_sha256: computed,
      parser_version: body.parser_version || 'unknown',
      promotion_authorized: false
    }
  };

  try {
    const created = await insertBatch(batchPayload);
    const batch = created[0];
    const stagingRows = body.rows.map((row, index) => ({
      batch_id: batch.id,
      source_row_number: row.source_row_number || index + 1,
      external_source: row.external_source || 'native_workbook',
      external_id: row.external_id || null,
      normalized_record: row.normalized_record || row,
      row_fingerprint: row.row_fingerprint
        || crypto.createHash('sha256').update(JSON.stringify(row)).digest('hex'),
      state: 'staged',
      exception_codes: row.exception_codes || [],
      consent_candidate: row.consent_candidate || 'unknown',
      relationship_candidate: row.relationship_candidate || null
    }));
    const insertedRows = await insertRows(stagingRows);
    return send(res, 201, {
      batch,
      staged_row_count: insertedRows.length,
      promotion_authorized: false
    });
  } catch (error) {
    return send(res, 502, { error: String(error.message || error) });
  }
}).listen(PORT, () => {
  console.log(`import API listening on ${PORT}`);
});
