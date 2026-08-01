import http from 'node:http';
import crypto from 'node:crypto';

const DEFAULT_PORT = 8787;
const MAX_BODY_BYTES = 5_000_000;

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

function bearerToken(req) {
  const authorization = req.headers.authorization;
  const match = typeof authorization === 'string'
    ? authorization.match(/^Bearer\s+(\S+)$/i)
    : null;
  return match?.[1] || null;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error('payload_too_large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function createImportApi({ supabaseUrl, serviceRoleKey, fetchImpl = fetch, logger = console }) {
  function logFailure(event, code) {
    logger.error({ event, code });
  }

  async function authenticatedUser(req) {
    const token = bearerToken(req);
    if (!token) return null;

    const response = await fetchImpl(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${token}`
      }
    });
    if (!response.ok) return null;

    const user = await response.json();
    return isUuid(user?.id) ? user : null;
  }

  async function authorizedImportProfile(req, user) {
    const token = bearerToken(req);
    const response = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/require_privileged_mfa`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${token}`,
        'content-type': 'application/json'
      },
      body: '{}'
    });
    if (!response.ok) return null;

    const profile = await response.json();
    return profile?.id === user.id
      && profile.active === true
      && profile.mfa_enforced === true
      && ['director', 'data_steward'].includes(profile.role)
      ? profile
      : null;
  }

  async function createBatchTransaction(req, batch, rows) {
    const response = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/create_import_batch`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${bearerToken(req)}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ p_batch: batch, p_rows: rows })
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`atomic_import_failed:${response.status}:${detail}`);
    }
    return response.json();
  }

  return http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/v1/import-batches') {
      return send(res, 404, { error: 'not_found' });
    }
    if (!supabaseUrl || !serviceRoleKey) {
      return send(res, 503, { error: 'server_misconfigured' });
    }

    let actor;
    try {
      actor = await authenticatedUser(req);
    } catch {
      logFailure('supabase_session_verification_failed', 'authentication_unavailable');
      return send(res, 503, { error: 'authentication_unavailable' });
    }
    if (!actor) {
      return send(res, 401, { error: 'valid_bearer_session_required' });
    }

    let profile;
    try {
      profile = await authorizedImportProfile(req, actor);
    } catch {
      logFailure('supabase_authorization_verification_failed', 'authorization_unavailable');
      return send(res, 503, { error: 'authorization_unavailable' });
    }
    if (!profile) {
      return send(res, 403, { error: 'import_role_and_mfa_required' });
    }

    let raw;
    try {
      raw = await readBody(req);
    } catch (error) {
      return send(res, error.status || 400, { error: error.message });
    }

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
      receipt: {
        parsed_rows_sha256: computed,
        parser_version: body.parser_version || 'unknown',
        promotion_authorized: false
      }
    };

    try {
      const stagingRows = body.rows.map((row, index) => ({
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
      const result = await createBatchTransaction(req, batchPayload, stagingRows);
      if (!isUuid(result?.batch?.id)
          || result.staged_row_count !== stagingRows.length
          || result.promotion_authorized !== false) {
        throw new Error('atomic_import_failed:invalid_response');
      }
      return send(res, 201, result);
    } catch {
      logFailure('import_batch_creation_failed', 'import_persistence_failed');
      return send(res, 502, { error: 'import_persistence_failed' });
    }
  });
}

export function startImportApi(env = process.env) {
  const port = Number(env.PORT || DEFAULT_PORT);
  const server = createImportApi({
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY
  });
  return server.listen(port, () => console.log(`import API listening on ${port}`));
}

if (import.meta.url === `file://${process.argv[1]}`) startImportApi();
