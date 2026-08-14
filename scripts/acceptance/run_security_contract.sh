#!/usr/bin/env bash
set -euo pipefail

# Runtime and authorization boundaries.
grep -q "campaign-private" supabase/migrations/006_private_storage.sql
grep -q "public = false" tests/rls/role_matrix.sql
grep -q "Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')" supabase/functions/signed-document-url/index.ts
grep -q ".eq('id', userData.user.id)" supabase/functions/signed-document-url/index.ts
grep -q "record_document_access" supabase/functions/signed-document-url/index.ts
grep -q "expiresIn < 30 || expiresIn > 300" supabase/functions/signed-document-url/index.ts
grep -q "approve_import_row" import-review.js
grep -q "create_import_batch" services/import-api/server.mjs
grep -q "/auth/v1/user" services/import-api/server.mjs
grep -q "require_privileged_mfa" services/import-api/server.mjs
! grep -q "x-authenticated-user" services/import-api/server.mjs
! grep -Eq "logger\.error\([^)]*error" services/import-api/server.mjs
grep -q "require_unexpired_session" supabase/migrations/010_session_expiration.sql
grep -q "session_expired" supabase/tests/rls_e2e.sql
grep -q "campaign-private must not be public" supabase/tests/storage_matrix.sql

# Toolchain and staging controls.
grep -qx '22.18.0' .nvmrc
grep -qx 'nodejs 22.18.0' .tool-versions
grep -qx 'deno 2.2.7' .tool-versions
grep -qx 'postgres 15.8' .tool-versions
grep -q 'version: 2.31.8' .github/workflows/local-supabase-tests.yml
grep -q "remote-staging" scripts/staging/verify-policy-suite.sh
grep -q "STAGING_CONFIRM_PROJECT_REF" scripts/staging/apply-migrations.sh
grep -q 'suite_count": 8' scripts/staging/verify-policy-suite.sh
test -f supabase/tests/016_delegate_auth.sql
grep -q "verify_jwt = false" supabase/config.toml
grep -q "RESEND_API_KEY" supabase/functions/auth-email/index.ts
grep -q "STAGING_SUPABASE_ANON_KEY" .github/workflows/validate-and-deploy.yml
grep -q "Refusing to emit runtime config for unlisted Supabase host" scripts/staging/generate-runtime-config.mjs
! grep -q "SUPABASE_SERVICE_ROLE_KEY" scripts/staging/generate-runtime-config.mjs
grep -B1 'src="workspace.js"' workspace.html | grep -q 'src="runtime-config.js"'
grep -B1 'src="import-review.js"' import-review.html | grep -q 'src="runtime-config.js"'

# Governance and production boundaries.
test -f docs/OPERATIONAL-CONTROLS.md
test -f docs/RETENTION-LEGAL-HOLD.md
test -f docs/templates/RESTORE-DRILL-EVIDENCE.md
grep -q "30-300 seconds; 60-second default" docs/PRODUCTION-HARDENING.md
grep -q "Production purge automation may be enabled only" docs/RETENTION-LEGAL-HOLD.md
! grep -q "private_documents" supabase/functions/signed-document-url/index.ts
! grep -q "outreach_authorized" workspace.js
grep -q "promotion_authority: false" services/workbook-parser/src/cli.js
grep -q "only native .xlsx files are accepted" services/workbook-parser/src/cli.js

python3 - <<'PY'
from pathlib import Path
import re

patterns = [
    re.compile(r'BEGIN\s+PRIVATE\s+KEY', re.I),
    re.compile(r'SUPABASE_SERVICE_ROLE_KEY\s*=\s*["\'][^"\']+["\']'),
    re.compile(r'service_role\s*:\s*["\']eyJ[A-Za-z0-9_-]+', re.I),
]
findings = []
for path in Path('.').rglob('*'):
    if not path.is_file() or path.suffix == '.md' or '.git' in path.parts:
        continue
    try:
        text = path.read_text(encoding='utf-8')
    except UnicodeDecodeError:
        continue
    if any(pattern.search(text) for pattern in patterns):
        findings.append(str(path))
if findings:
    raise SystemExit('Potential embedded service credential found:\n' + '\n'.join(findings))
PY

# Provenance: Notion Sprint 001 Hub + Loop 805 Slice AGI-AUTH-DELEGATES + Hash: 622346cc565b1d6c7ebfc75eb7590b8dd03af601
