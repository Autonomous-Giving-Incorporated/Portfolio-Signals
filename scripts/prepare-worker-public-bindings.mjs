// Offline preparation only. The caller owns private temporary-file cleanup.
import { writeFileSync } from 'node:fs';
const key = process.env.PLATFORM_SUPABASE_ANON_KEY || process.env.STAGING_SUPABASE_ANON_KEY;
try {
  const project = 'utdioxwiskzatwoejgiu';
  const url = process.env.PLATFORM_SUPABASE_URL || process.env.STAGING_SUPABASE_URL;
  if (url !== `https://${project}.supabase.co` || !key || !process.argv[2]) throw new Error();
  // Classification only, not signature verification. Provenance is operator-owned.
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    const parts = key.split('.');
    if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error();
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (claims.role !== 'anon' || claims.ref !== project) throw new Error();
  }
  writeFileSync(process.argv[2], JSON.stringify({ PLATFORM_SUPABASE_ANON_KEY: key }), { flag: 'wx', mode: 0o600 });
} catch {
  console.error('Public Worker binding preparation failed; verify target, public key and new private output path.');
  process.exitCode = 1;
}
