/**
 * Donor receipt UI with optional Supabase staff auth.
 */
import { impactRelayApiBase, impactRelayFetch, loadImpactRelaySession } from './workspace/impact-relay-bridge.js';

const $ = (id) => document.getElementById(id);

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character]));
}

function setMsg(t, err = false) {
  $("actionMsg").textContent = t;
  $("actionMsg").style.color = err ? "#b00" : "";
}

async function load() {
  const donorId = $("donorId").value.trim();
  if (!donorId) return setMsg("Enter donor id", true);
  try {
    await impactRelayFetch("/api/health");
    $("apiStatus").textContent = "API online";
    $("apiStatus").className = "status-pill";
    const ctx = await loadImpactRelaySession({ requireStaff: false });
    if (ctx.mode === "supabase") {
      $("identityLine").textContent = `${ctx.email} · ${ctx.role} · donor ${donorId}`;
    }

    const { data: dashWrap } = await impactRelayFetch(
      `/api/donors/${encodeURIComponent(donorId)}/dashboard`,
      { requireStaff: true }
    );
    const d = dashWrap.dashboard;
    const grid = $("balanceGrid");
    grid.innerHTML = "";
    for (const b of d.allocations || []) {
      const el = document.createElement("article");
      el.className = "metric-card";
      el.innerHTML = `<span class="metric-label">${escapeHtml(b.allocation_name)}</span>
        <strong>${escapeHtml(b.remaining)}</strong>
        <span class="note">remaining of ${escapeHtml(b.designated_total)} (used ${escapeHtml(b.used)})</span>`;
      grid.appendChild(el);
    }

    const tl = $("timeline");
    tl.innerHTML = (d.timeline || [])
      .map(
        (e) =>
          `<div class="panel" style="margin-bottom:0.5rem"><strong>${escapeHtml(e.kind)}</strong>
          <span class="note">${escapeHtml(e.at)}</span><p>${escapeHtml(e.summary)}</p></div>`
      )
      .join("") || "<p class='note'>No timeline events. Load pilot UOF into the console data-dir.</p>";

    const rec = $("receipts");
    const list = d.receipts || [];
    if (!list.length) {
      rec.innerHTML =
        "<p class='note'>No receipts. Run Impact Relay pilot (run_pilot) into the server data-dir.</p>";
    } else {
      rec.innerHTML = list
        .map((r) => {
          const id = r.receipt_id;
          const amt = r.expenditure?.attributed_amount || r.attributed_amount || "—";
          return `<div class="control-grid" style="margin-bottom:0.5rem">
            <span>${escapeHtml(id)} · ${escapeHtml(amt)}</span>
            <button type="button" class="button secondary btn-r" data-id="${escapeHtml(id)}">Open</button>
          </div>`;
        })
        .join("");
      rec.querySelectorAll(".btn-r").forEach((btn) => {
        btn.addEventListener("click", () => openReceipt(donorId, btn.dataset.id));
      });
    }
    setMsg(`Loaded dashboard for ${donorId} via ${impactRelayApiBase()}`);
  } catch (err) {
    $("apiStatus").textContent = "API offline / auth";
    $("apiStatus").className = "status-pill status-blocked";
    setMsg(String(err.message || err), true);
  }
}

async function openReceipt(donorId, rid) {
  try {
    const { data: out } = await impactRelayFetch(
      `/api/donors/${encodeURIComponent(donorId)}/receipts/${encodeURIComponent(rid)}`,
      { requireStaff: true }
    );
    $("detailPanel").hidden = false;
    $("receiptDetail").textContent = JSON.stringify(out.receipt, null, 2);
  } catch (err) {
    setMsg(String(err.message || err), true);
  }
}

function renderDonationCta(link) {
  const el = $("donationCta");
  if (!el) return;
  el.replaceChildren();
  if (!link) {
    el.textContent = "CTA omitted — no donation_link on the tenant record.";
    return;
  }
  const a = document.createElement("a");
  a.href = link;
  a.rel = "noopener noreferrer";
  a.textContent = link;
  el.append("Give again: ", a);
}

async function loadTenantDonationLink() {
  const jwt = sessionStorage.getItem("am_access_token");
  if (!jwt) {
    renderDonationCta(null);
    return;
  }
  try {
    const res = await fetch("/packet", { headers: { Authorization: `Bearer ${jwt}` } });
    if (!res.ok) {
      renderDonationCta(null);
      return;
    }
    const packet = await res.json();
    renderDonationCta(packet.donationLink || null);
  } catch {
    renderDonationCta(null);
  }
}

$("btnLoad").addEventListener("click", load);
loadTenantDonationLink();
$("apiBase")?.addEventListener("change", () => {
  localStorage.setItem("IMPACT_RELAY_API", impactRelayApiBase());
});
