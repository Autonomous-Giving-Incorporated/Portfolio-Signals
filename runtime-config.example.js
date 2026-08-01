// Copy to runtime-config.js at deploy time. Do not commit service-role keys or other secrets.
// Load this file before workspace.js / import-review.js in authenticated deployments only.
window.HACKER_DOJO_CONFIG = {
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR_PUBLIC_ANON_KEY'
};
