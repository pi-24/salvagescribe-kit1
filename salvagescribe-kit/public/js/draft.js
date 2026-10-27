// public/js/draft.js — Draft screen (editable, disclosure, compatibility, approve)

const Draft = {
  data: null,
  partId: null,

  async load(partId) {
    this.partId = partId;
    await this.render();
  },

  async render() {
    const container = document.getElementById("draft-content");
    container.innerHTML = `<div class="loading">${t("ingesting")}</div>`;

    try {
      const result = await API.getDraft(this.partId);
      this.data = result;
      container.innerHTML = this.buildHTML(result);
      this.attachEvents();
    } catch (err) {
      container.innerHTML = `<div class="empty-state">Error: ${err.message}</div>`;
    }
  },

  buildHTML(result) {
    // Blocked draft
    if (result.blocked) {
      return `
        <div class="draft-block">
          <div class="draft-guardrail-notice">
            <strong>${t("draft_blocked")} (${result.guardrail || "G3"})</strong><br/>
            ${App.esc(result.reason || "")}
          </div>
          <div class="empty-state">${t("draft_blocked_msg")}</div>
          <div class="detail-nav">
            <button class="btn-primary" onclick="App.goDetail()">${t("back_detail")}</button>
          </div>
        </div>
      `;
    }

    const d = result.draft;
    const approved = result.ledger_json?.classification === "READY_FOR_REVIEW" && this.isApproved;

    // Build condition disclosure block
    const cd = d.condition_disclosure || {};
    const conditionBlock = `
      <div class="compat-sub-block">
        <h4>${t("condition_block")}</h4>
        <div style="font-size:13px;">
          <div><strong>Cosmetic:</strong> ${App.esc(cd.cosmetic || "—")}</div>
          <div><strong>Structural:</strong> ${App.esc(cd.structural || "—")}</div>
          <div><strong>Glass:</strong> ${App.esc(cd.glass || "—")}</div>
          <div><strong>Tested:</strong> ${App.esc(cd.tested || "—")}</div>
        </div>
      </div>
    `;

    // Build compatibility block (3 sub-blocks)
    const compat = d.compatibility || {};
    const confirmedFitment = (compat.confirmed_fitment || []).map((f) =>
      `${App.esc(f.make)} ${App.esc(f.model)} ${App.esc(f.years)} (${App.esc(f.side || "")}`
    ).join("<br/>");

    const compatBlock = `
      <div class="compat-sub-block">
        <h4>${t("compat_donor")}</h4>
        <div style="font-size:13px;">${App.esc(compat.donor_vehicle_recorded || "—")}</div>
      </div>
      <div class="compat-sub-block ${compat.confirmed_fitment?.length > 0 ? "confirmed" : ""}">
        <h4>${t("compat_confirmed")}</h4>
        <div style="font-size:13px;">${confirmedFitment || '<span style="color:var(--text-light)">—</span>'}</div>
      </div>
      ${compat.unverified_statement ? `
        <div class="compat-sub-block unverified">
          <h4>${t("compat_unverified")}</h4>
          <div style="font-size:13px;font-style:italic;">${App.esc(compat.unverified_statement)}</div>
        </div>
      ` : ""}
    `;

    // Guardrail notices
    let guardrailHTML = "";
    if (d.guardrails_applied?.g1_stripped?.length > 0) {
      guardrailHTML += `<div class="draft-guardrail-notice">⚠ Guardrail G1: stripped "${d.guardrails_applied.g1_stripped.join(", ")}" (tested ≠ tested_ok)</div>`;
    }
    if (d.guardrails_applied?.g2_matched) {
      guardrailHTML += `<div class="draft-guardrail-notice">✓ Guardrail G2: confirmed fitment from reference table</div>`;
    }

    // Approve button state
    const isReady = result.ledger_json?.classification === "READY_FOR_REVIEW";
    const approveDisabled = !isReady || approved;
    const approveBtn = `
      <button class="btn-approve" id="approve-btn" ${approveDisabled ? "disabled" : ""} onclick="Draft.approve()">
        ${approved ? t("approved_msg") : (isReady ? t("approve_btn") : t("approve_disabled"))}
      </button>
    `;

    return `
      ${approved ? `<div class="draft-approved-banner">${t("approved_msg")}</div>` : ""}
      <div class="draft-block">
        <h3>${t("draft_title")}</h3>
        ${guardrailHTML}
        <div class="draft-field">
          <label>${t("title_field")}</label>
          <input type="text" id="draft-title" value="${App.esc(d.title || "")}" maxlength="80" />
        </div>
        <div class="draft-field">
          <label>${t("description_field")}</label>
          <textarea id="draft-desc">${App.esc(d.description_markdown || "")}</textarea>
        </div>
        <div class="draft-field">
          <label>${t("category_field")}</label>
          <input type="text" id="draft-category" value="${App.esc(d.category_suggestion || "")}" />
        </div>
        <div style="display:flex;gap:8px;margin-top:8px;">
          <button class="btn-primary" onclick="Draft.saveEdits()">${t("saved")}</button>
        </div>
      </div>
      <div class="draft-block">
        <h3>${t("condition_block")}</h3>
        ${conditionBlock}
      </div>
      <div class="draft-block">
        <h3>${t("compat_block")}</h3>
        ${compatBlock}
      </div>
      <div class="draft-block">
        ${approveBtn}
      </div>
    `;
  },

  attachEvents() {
    // No-op for now
  },

  async saveEdits() {
    const title = document.getElementById("draft-title")?.value;
    const desc = document.getElementById("draft-desc")?.value;
    if (!title && !desc) return;

    try {
      await API.saveDraftEdit(this.partId, { title, description_markdown: desc });
      // Re-render to show saved state
      this.render();
    } catch (err) {
      alert("Error saving: " + err.message);
    }
  },

  async approve() {
    const btn = document.getElementById("approve-btn");
    btn.disabled = true;
    btn.textContent = "...";

    try {
      const result = await API.approve(this.partId);
      if (result.status === 200) {
        this.isApproved = true;
        this.render();
      } else {
        alert(result.data.reason || "Cannot approve");
        btn.disabled = false;
        btn.textContent = t("approve_btn");
      }
    } catch (err) {
      alert("Error: " + err.message);
      btn.disabled = false;
      btn.textContent = t("approve_btn");
    }
  },
};
