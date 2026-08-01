/**
 * Finance review UI backed by Impact Relay console_server.
 * See docs/IMPACT-RELAY.md
 */

const $ = (id) => document.getElementById(id);

function apiBase() {
  const fromInput = $("apiBase")?.value?.trim();
  const fromStore = localStorage.getItem("IMPACT_RELAY_API");
  return (fromInput || fromStore || "http://127.0.0.1:8787").replace(/\/$/, "");
}

function authHeaders() {
  const email = $("approverEmail")?.value?.trim() || "finance.approver@hackersdojo.example";
  return {
    Authorization: `Bearer ${email}`,
    "Content-Type": "application/json",
  };
}

async function api(path, opts = {}) {
  const res = await fetch(`${apiBase()}${path}`, {
    ...opts,
    headers: { ...authHeaders(), ...(opts.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok && body.ok !== true) {
    throw new Error(body.message || body.error || res.statusText);
  }
  return body;
}

function setMsg(text, isError = false) {
  const el = $("actionMsg");
  el.textContent = text;
  el.className = isError ? "note" : "note";
  el.style.color = isError ? "var(--danger, #b00)" : "";
}

async function refresh() {
  try {
    const health = await api("/api/health");
    $("apiStatus").textContent = "API online";
    $("apiStatus").className = "status-pill";
    const metrics = await api("/api/finance/metrics");
    $("waitingCount").textContent = metrics.waiting_count ?? "—";
    $("attentionCount").textContent = metrics.attention_count ?? "—";
    $("ledgerCmds").textContent = metrics.ledger_commands ?? "—";
    $("expenseCount").textContent = metrics.expenses_in_ledger ?? "—";

    const queue = await api("/api/finance/queue?filters=waiting,blocked,dead_letter,needs_information,failed");
    const root = $("queueList");
    if (!queue.cases?.length) {
      root.innerHTML = "<p class='note'>No open cases. Seed a pilot expense to create a waiting approval.</p>";
      return;
    }
    root.innerHTML = "";
    for (const c of queue.cases) {
      const card = document.createElement("article");
      card.className = "panel";
      card.style.marginBottom = "0.75rem";
      const pkt = c.packet_summary || {};
      card.innerHTML = `
        <div class="panel-heading">
          <h3 style="margin:0;font-size:1rem">${c.workflow_id}</h3>
          <span class="tag">${c.bucket || c.run_status}</span>
        </div>
        <p class="note">${pkt.vendor || "—"} · ${pkt.amount || "—"} ${pkt.currency || ""} · ${pkt.category || ""}</p>
        <p class="note">${pkt.description || c.business_key || ""}</p>
        <div class="control-grid">
          <button type="button" class="button secondary btn-detail" data-id="${c.workflow_id}">Detail</button>
          ${
            c.bucket === "waiting" || c.run_status === "WAITING_SIGNAL"
              ? `<button type="button" class="button btn-approve" data-id="${c.workflow_id}">Approve</button>`
              : ""
          }
        </div>
      `;
      root.appendChild(card);
    }
    root.querySelectorAll(".btn-detail").forEach((btn) => {
      btn.addEventListener("click", () => showDetail(btn.dataset.id));
    });
    root.querySelectorAll(".btn-approve").forEach((btn) => {
      btn.addEventListener("click", () => approve(btn.dataset.id));
    });
    setMsg(`Loaded ${queue.count} case(s).`);
  } catch (err) {
    $("apiStatus").textContent = "API offline";
    $("apiStatus").className = "status-pill status-blocked";
    setMsg(String(err.message || err), true);
  }
}

async function showDetail(workflowId) {
  try {
    const detail = await api(`/api/finance/cases/${encodeURIComponent(workflowId)}`);
    $("detailPanel").hidden = false;
    $("caseDetail").textContent = JSON.stringify(detail, null, 2);
  } catch (err) {
    setMsg(String(err.message || err), true);
  }
}

async function approve(workflowId) {
  try {
    const out = await api(`/api/finance/cases/${encodeURIComponent(workflowId)}/approve`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (!out.ok) {
      setMsg(out.message || out.error || "approve failed", true);
      return;
    }
    setMsg(`Approved ${workflowId} → expense ${out.expense_id} (${out.expense_state}).`);
    await refresh();
  } catch (err) {
    setMsg(String(err.message || err), true);
  }
}

async function seed() {
  try {
    const out = await api("/api/pilot/seed", { method: "POST", body: "{}" });
    setMsg(out.ok ? `Seeded ${out.started?.length || 0} workflow(s).` : JSON.stringify(out));
    await refresh();
  } catch (err) {
    setMsg(String(err.message || err), true);
  }
}

$("btnRefresh").addEventListener("click", refresh);
$("btnSeed").addEventListener("click", seed);
$("apiBase").addEventListener("change", () => {
  localStorage.setItem("IMPACT_RELAY_API", apiBase());
});
refresh();
