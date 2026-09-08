export function jwtAssuranceLevel(accessToken: string): string | null {
  try {
    const encoded = accessToken.split('.')[1];
    if (!encoded) return null;
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(encoded.length / 4) * 4, '=');
    const claims = JSON.parse(atob(base64));
    return typeof claims?.aal === 'string' ? claims.aal : null;
  } catch {
    return null;
  }
}

// Provenance: Notion Sprint 001 Hub + Loop 805 Slice 19 + Hash: eeb04eebe1d44b81200b52da47edcb4fc3ca0bc5
