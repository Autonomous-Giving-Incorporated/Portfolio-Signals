import { writeFileSync } from 'node:fs';

const supabaseUrl = (
  process.env.PLATFORM_SUPABASE_URL || process.env.STAGING_SUPABASE_URL || ''
).trim();
const supabaseAnonKey = (
  process.env.PLATFORM_SUPABASE_ANON_KEY || process.env.STAGING_SUPABASE_ANON_KEY || ''
).trim();

const ALLOWED_HOSTS = new Set([
  'https://utdioxwiskzatwoejgiu.supabase.co',
  // legacy freeze: emit only if explicitly forced for emergency Pages rollback
  'https://ecxkhihlbrcwpavfoaoq.supabase.co',
]);

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'PLATFORM_SUPABASE_URL (or STAGING_SUPABASE_URL) and matching ANON_KEY are required',
  );
}

if (!ALLOWED_HOSTS.has(supabaseUrl)) {
  throw new Error(`Refusing to emit runtime config for unlisted Supabase host: ${supabaseUrl}`);
}

if (
  supabaseUrl === 'https://ecxkhihlbrcwpavfoaoq.supabase.co' &&
  process.env.ALLOW_LEGACY_STAGING_RUNTIME !== '1'
) {
  throw new Error(
    'Legacy staging host blocked. Set PLATFORM_* to utdioxwiskzatwoejgiu or ALLOW_LEGACY_STAGING_RUNTIME=1',
  );
}

const runtimeConfig = [
  '// Generated runtime config — browser-public Supabase values only. Never service-role.',
  'window.HACKER_DOJO_CONFIG = {',
  `  supabaseUrl: ${JSON.stringify(supabaseUrl)},`,
  `  supabaseAnonKey: ${JSON.stringify(supabaseAnonKey)},`,
  '  defaultClientSlug: "hacker-dojo"',
  '};',
  '',
].join('\n');

writeFileSync('runtime-config.js', runtimeConfig, { encoding: 'utf8', mode: 0o600 });
