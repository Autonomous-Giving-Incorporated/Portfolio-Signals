// Copy to runtime-config.js at deploy time (gitignored). Do not commit secrets.
// Load this file before workspace.js / import-review.js in authenticated deployments only.
// Staging project ref: ecxkhihlbrcwpavfoaoq — see docs/STAGING-BOOTSTRAP.md
window.HACKER_DOJO_CONFIG = {
  supabaseUrl: 'https://ecxkhihlbrcwpavfoaoq.supabase.co',
  supabaseAnonKey: 'YOUR_PUBLIC_ANON_KEY',
  defaultClientSlug: 'hacker-dojo'
};
