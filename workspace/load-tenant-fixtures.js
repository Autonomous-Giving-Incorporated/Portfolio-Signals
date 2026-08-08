/**
 * Load tenant-canonical fixture tables after requireTenantAccess succeeds.
 * Paths are under data/tenant/<client_id>/ — not for anonymous consumption intent;
 * still gated in UI; prefer private storage later.
 */

export async function loadTenantFixtures(clientId = 'org_hacker_dojo') {
  const base = `data/tenant/${encodeURIComponent(clientId)}`;

  await loadSponsors(`${base}/sponsors.json`);
}

async function loadSponsors(path) {
  const tbody = document.querySelector('#sponsorTable tbody');
  if (!tbody) return;
  try {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(`sponsors ${res.status}`);
    const doc = await res.json();
    const rows = Array.isArray(doc.rows) ? doc.rows : [];
    tbody.innerHTML = rows
      .map(
        (r) => `<tr data-priority="${esc(r.priority)}" data-stage="${esc(r.stage)}">
      <td>${esc(r.company)}</td>
      <td>${esc(r.sector)}</td>
      <td>${esc(r.stage_label)}</td>
      <td>${esc(r.priority_label)}</td>
      <td>${esc(r.ask)}</td>
      <td>${esc(r.control)}</td>
    </tr>`
      )
      .join('');
    const count = document.querySelector('[data-visible-count="sponsorTable"]');
    if (count) count.textContent = String(rows.length);
  } catch (err) {
    console.warn('loadSponsors', err);
    tbody.innerHTML = '<tr><td colspan="6">Unable to load tenant sponsor fixtures.</td></tr>';
  }
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
