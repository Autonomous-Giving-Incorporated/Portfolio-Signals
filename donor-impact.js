/**
 * Donor receipt UI backed by Impact Relay console_server.
 * Requires pilot ledger with UOF receipts (run_pilot or full --all-phases into data-dir).
 */

const $ = (id) => document.getElementById(id);

function apiBase() {
  const fromInput = $("apiBase")?.value?.trim();
  return (fromInput || localStorage.getItem("IMPACT_RELAY_API") || "http://127.0.0.1:8787").replace(
    /\/$/,
    ""
  );
}

async function api(path) {
  const res = await fetch(`${apiBase()}${path}`, {
    headers: {
      Authorization: "Bearer auditor@hackersdojo.example",
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || res.statusText);
  return body;
}

function setMsg(t, err = false) {
  $("actionMsg").textContent = t;
  $("actionMsg").style.color = err ? "#b00" : "";
}

async function load() {
  const donorId = $("donorId").value.trim();
  if (!donorId) return setMsg("Enter donor id", true);
  try {
    await api("/api/health");
    $("apiStatus").textContent = "API online";
    $("apiStatus").className = "status-pill";

    const dash = await api(`/api/donors/${encodeURIComponent(donorId)}/dashboard`);
    const d = dash.dashboard;
    const grid = $("balanceGrid");
    grid.innerHTML = "";
    for (const b of d.allocations || []) {
      const el = document.createElement("article");
      el.className = "metric-card";
      el.innerHTML = `<span class="metric-label">${b.allocation_name}</span>
        <strong>${b.remaining}</strong>
        <span class="note">remaining of ${b.designated_total} (used ${b.used})</span>`;
      grid.appendChild(el);
    }

    const tl = $("timeline");
    tl.innerHTML = (d.timeline || [])
      .map(
        (e) =>
          `<div class="panel" style="margin-bottom:0.5rem"><strong>${e.kind}</strong>
          <span class="note">${e.at}</span><p>${e.summary}</p></div>`
      )
      .join("") || "<p class='note'>No timeline events. Seed UOF pilot data first.</p>";

    const rec = $("receipts");
    const list = d.receipts || [];
    if (!list.length) {
      rec.innerHTML =
        "<p class='note'>No receipts. Run Impact Relay pilot (run_pilot) into the server data-dir, or approve expenses that publish UOF.</p>";
    } else {
      rec.innerHTML = list
        .map((r) => {
          const id = r.receipt_id;
          const amt = r.expenditure?.attributed_amount || r.attributed_amount || "—";
          return `<div class="control-grid" style="margin-bottom:0.5rem">
            <span>${id} · ${amt}</span>
            <button type="button" class="button secondary btn-r" data-id="${id}">Open</button>
          </div>`;
        })
        .join("");
      rec.querySelectorAll(".btn-r").forEach((btn) => {
        btn.addEventListener("click", () => openReceipt(donorId, btn.dataset.id));
      });
    }
    setMsg(`Loaded dashboard for ${donorId}.`);
  } catch (err) {
    $("apiStatus").textContent = "API offline";
    $("apiStatus").className = "status-pill status-blocked";
    setMsg(String(err.message || err), true);
  }
}

async function openReceipt(donorId, rid) {
  try {
    const out = await api(
      `/api/donors/${encodeURIComponent(donorId)}/receipts/${encodeURIComponent(rid)}`
    );
    $("detailPanel").hidden = false;
    $("receiptDetail").textContent = JSON.stringify(out.receipt, null, 2);
  } catch (err) {
    setMsg(String(err.message || err), true);
  }
}

$("btnLoad").addEventListener("click", load);
$("apiBase").addEventListener("change", () => {
  localStorage.setItem("IMPACT_RELAY_API", apiBase());
});
