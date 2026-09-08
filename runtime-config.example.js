// Copy to runtime-config.js at deploy time (gitignored). Do not commit secrets.
// Load before workspace.js / import-review.js. Anon key only — never service-role.
// Platform Supabase: utdioxwiskzatwoejgiu — Hacker Dojo is defaultClientSlug (tenant), not product.
window.AGI_PORTFOLIO_SIGNALS_CONFIG = {
  supabaseUrl: 'https://utdioxwiskzatwoejgiu.supabase.co',
  supabaseAnonKey: 'YOUR_PUBLIC_ANON_KEY',
  defaultClientSlug: 'hacker-dojo',
  productName: 'Portfolio Signals',
  platformName: 'Autonomously Giving Incorporated',
  impactRelayApiBase: 'https://impact-relay.example.run.app',
  // Impact Relay admin API for tenant management (optional - enables web-based tenant cloning)
  // Set to your Impact Relay admin endpoint, e.g., 'https://impact-relay-admin.example.run.app'
  // or 'http://localhost:8787' for local development
  impactRelayAdminUrl: 'https://impact-relay-admin.example.run.app',
};
window.AGI_FUND_INTEL_CONFIG = window.AGI_PORTFOLIO_SIGNALS_CONFIG;
window.HACKER_DOJO_CONFIG = window.AGI_PORTFOLIO_SIGNALS_CONFIG;
window.__HD_CONFIG__ = window.AGI_PORTFOLIO_SIGNALS_CONFIG;
