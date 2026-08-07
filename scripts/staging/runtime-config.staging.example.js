// Deploy-time public config for the authenticated workspace on platform.
// Copy to repo-root runtime-config.js (gitignored). Do not commit.
// Do not place service-role keys or encryption material in this file.
// Project ref: utdioxwiskzatwoejgiu (platform). defaultClientSlug is the tenant.
window.AGI_PORTFOLIO_SIGNALS_CONFIG = {
  supabaseUrl: 'https://utdioxwiskzatwoejgiu.supabase.co',
  supabaseAnonKey: 'YOUR_PUBLIC_ANON_KEY',
  defaultClientSlug: 'hacker-dojo',
  productName: 'Portfolio Signals',
  platformName: 'Autonomously Giving Incorporated',
};
window.AGI_FUND_INTEL_CONFIG = window.AGI_PORTFOLIO_SIGNALS_CONFIG;
window.HACKER_DOJO_CONFIG = window.AGI_PORTFOLIO_SIGNALS_CONFIG;
window.__HD_CONFIG__ = window.AGI_PORTFOLIO_SIGNALS_CONFIG;
