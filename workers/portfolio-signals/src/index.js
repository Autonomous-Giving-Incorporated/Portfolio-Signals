import { handleEveryOrgWebhook } from './every-org-webhook.js';

function jsonResponse(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'x-content-type-options': 'nosniff',
      'cache-control': 'no-store',
    },
  });
}

export async function handleWorkerRequest(request, env, options = {}) {
  const url = new URL(request.url);
  if (url.pathname === '/webhooks/every-org') {
    return handleEveryOrgWebhook(request, env, options);
  }
  if (url.pathname.startsWith('/webhooks/')) {
    return jsonResponse(404, { error: 'not_found' });
  }
  if (env.ASSETS) {
    return env.ASSETS.fetch(request);
  }
  return jsonResponse(404, { error: 'not_found' });
}

export default {
  async fetch(request, env) {
    return handleWorkerRequest(request, env);
  },
};
