// Deploy-time public config for the authenticated workspace on platform.
// Copy to repo-root runtime-config.js (gitignored). Do not commit.
// Do not place service-role keys or encryption material in this file.
// Project ref: utdioxwiskzatwoejgiu (platform). defaultClientSlug is the tenant.
window.AGI_FUND_INTEL_CONFIG = {
  supabaseUrl: 'https://utdioxwiskzatwoejgiu.supabase.co',
  supabaseAnonKey: 'YOUR_PUBLIC_ANON_KEY',
  defaultClientSlug: 'hacker-dojo',
  productName: 'Fund Intel',
  platformName: 'Autonomously Giving Incorporated',
};
window.HACKER_DOJO_CONFIG = window.AGI_FUND_INTEL_CONFIG;
window.__HD_CONFIG__ = window.AGI_FUND_INTEL_CONFIG;
