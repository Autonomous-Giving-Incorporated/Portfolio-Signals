// Bootstrap deployment only: no mutation or privileged runtime authority.
// Removing containment requires a separately reviewed entrypoint/config change.
import worker from './index.js';
export default {
  fetch(request, env) {
    if (!['GET', 'HEAD'].includes(request.method)) {
      return Response.json({ error: 'bootstrap_read_only' }, { status: 503, headers: {
        'cache-control': 'no-store', 'x-content-type-options': 'nosniff'
      } });
    }
    // Secrets retained remotely by Wrangler must not enable allocation/webhooks.
    return worker.fetch(request, {
      ASSETS: env.ASSETS,
      ORG_ID: env.ORG_ID,
      PLATFORM_SUPABASE_URL: env.PLATFORM_SUPABASE_URL,
      PLATFORM_SUPABASE_ANON_KEY: env.PLATFORM_SUPABASE_ANON_KEY,
    });
  },
};
