// Local/CI browser fixture only. Copy to runtime-config.js for a loopback static server.
// The application rejects this mode on non-loopback hosts and whenever Supabase config is present.
window.AGI_PORTFOLIO_SIGNALS_CONFIG = {
  testMode: {
    runtime: 'test',
    fixture: 'portfolio-signals-synthetic-readonly-v1',
    backendOrigin: window.location.origin
  }
};
