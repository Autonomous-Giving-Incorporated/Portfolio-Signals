/**
 * Finance review UI — Supabase auth when configured; fixture pilot otherwise.
 */
import {
  impactRelayApiBase,
  impactRelayFetch,
  loadImpactRelaySession,
  clearWorkspaceSessionCache,
  createWorkspaceClient
} from './workspace/impact-relay-bridge.js';

const $ = (id) => document.getElementById(id);

function setMsg(text, isError = false) {
  const el = $("actionMsg");
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? "var(--danger, #b00)" : "";
}

function setIdentity(ctx) {
  const line = $("identityLine");
  if (!line) return;
  if (ctx.mode === "fixture") {
    line.textContent = "Local fixture mode (no Supabase config) · finance_approver pilot";
  } else if (ctx.mode === "supabase") {
    line.textContent = `${ctx.email} · ${ctx.role}`;
  } else {
    line.textContent = "Sign in required";
  }
}

async function refresh() {
  try {
    const { data: health } = await impactRelayFetch("/api/health");
    $("apiStatus").textContent = "API online";
    $("apiStatus").className = "status-pill";
    const ctx = await loadImpactRelaySession({ requireFinance: false });
    setIdentity(ctx);

    const { data: metrics } = await impactRelayFetch("/api/finance/metrics", {
      requireFinance: false
    });
    $("waitingCount").textContent = metrics.waiting_count ?? "—";
    $("attentionCount").textContent = metrics.attention_count ?? "—";
    $("ledgerCmds").textContent = metrics.ledger_commands ?? "—";
    $("expenseCount").textContent = metrics.expenses_in_ledger ?? "—";

    const { data: queue } = await impactRelayFetch(
      "/api/finance/queue?filters=waiting,blocked,dead_letter,needs_information,failed"
    );
    const root = $("queueList");
    if (!queue.cases?.length) {
      root.innerHTML =
        "<p class='note'>No open cases. Seed a pilot expense to create a waiting approval.</p>";
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
    setMsg(`Loaded ${queue.count} case(s). API ${impactRelayApiBase()}`);
  } catch (err) {
    if (err.code === "UNAUTHENTICATED") {
      $("apiStatus").textContent = "Sign in required";
      $("authGate").hidden = false;
      $("mainApp").hidden = true;
      return;
    }
    $("apiStatus").textContent = "API offline";
    $("apiStatus").className = "status-pill status-blocked";
    setMsg(String(err.message || err), true);
  }
}

async function showDetail(workflowId) {
  try {
    const { data: detail } = await impactRelayFetch(
      `/api/finance/cases/${encodeURIComponent(workflowId)}`
    );
    $("detailPanel").hidden = false;
    $("caseDetail").textContent = JSON.stringify(detail, null, 2);
  } catch (err) {
    setMsg(String(err.message || err), true);
  }
}

async function approve(workflowId) {
  try {
    const { data: out } = await impactRelayFetch(
      `/api/finance/cases/${encodeURIComponent(workflowId)}/approve`,
      { method: "POST", body: {}, requireFinance: true }
    );
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
    const { data: out } = await impactRelayFetch("/api/pilot/seed", {
      method: "POST",
      body: {},
      requireFinance: true
    });
    setMsg(out.ok ? `Seeded ${out.started?.length || 0} workflow(s).` : JSON.stringify(out));
    await refresh();
  } catch (err) {
    setMsg(String(err.message || err), true);
  }
}

function wireAuthGate() {
  const form = $("loginForm");
  if (!form) return;
  let client;
  try {
    client = createWorkspaceClient();
  } catch {
    $("authGate").hidden = true;
    $("mainApp").hidden = false;
    return;
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = $("email").value.trim();
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}${location.pathname}` }
    });
    $("authMessage").textContent = error
      ? error.message
      : "Check your email for the secure sign-in link.";
  });
  $("signOut")?.addEventListener("click", async () => {
    clearWorkspaceSessionCache();
    await client.auth.signOut();
    location.reload();
  });
  client.auth.onAuthStateChange(async (_e, session) => {
    if (session) {
      $("authGate").hidden = true;
      $("mainApp").hidden = false;
      await refresh();
    } else {
      $("authGate").hidden = false;
      $("mainApp").hidden = true;
    }
  });
  client.auth.getSession().then(async ({ data }) => {
    if (data.session) {
      $("authGate").hidden = true;
      $("mainApp").hidden = false;
      await refresh();
    } else {
      // Fixture mode if no runtime config
      try {
        createWorkspaceClient();
        $("authGate").hidden = false;
        $("mainApp").hidden = true;
      } catch {
        $("authGate").hidden = true;
        $("mainApp").hidden = false;
        await refresh();
      }
    }
  });
}

$("btnRefresh")?.addEventListener("click", refresh);
$("btnSeed")?.addEventListener("click", seed);
$("apiBase")?.addEventListener("change", () => {
  localStorage.setItem("IMPACT_RELAY_API", impactRelayApiBase());
});
wireAuthGate();
