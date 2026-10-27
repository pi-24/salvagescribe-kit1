// public/js/readiness.js — Readiness screen (rules, actions, banner)

const Readiness = {
  data: null,
  partId: null,

  async load(partId) {
    this.partId = partId;
    await this.render();
  },

  async render() {
    const container = document.getElementById("readiness-content");
    container.innerHTML = `<div class="loading">${t("ingesting")}</div>`;

    try {
      const result = await API.getReadiness(this.partId);
      this.data = result;
      container.innerHTML = this.buildHTML(result);
    } catch (err) {
      container.innerHTML = `<div class="empty-state">Error: ${err.message}</div>`;
    }
  },

  buildHTML(result) {
    const cls = result.class || "INFO_MISSING";
    const cssClass = App.classToCss(cls);
    const banner = result.banner || t("banner");
    const version = result.checklist_version || "—";

    // Rule list
    const rules = (result.rules || []).map((r) => {
      return `
        <div class="rule-row">
          <span class="rule-id">${App.esc(r.id)}</span>
          <div class="rule-detail">
            ${App.esc(r.detail || "")}
          </div>
          <span class="rule-chip ${r.result}">${r.result}</span>
        </div>
      `;
    }).join("");

    // Actions
    const actions = (result.actions || []);
    const actionHTML = actions.length > 0
      ? actions.map((a, i) => {
          return `
            <div class="action-row">
              <div class="action-priority" style="background:${i < 3 ? "var(--specialist)" : i < 6 ? "var(--info)" : "var(--text-light)"}">${i + 1}</div>
              <div>
                <strong>${App.esc(a.rule_id || "—")}</strong>: ${App.esc(a.text || "")}
                ${a.detail ? `<br/><span style="font-size:12px;color:var(--text-light);">${App.esc(a.detail)}</span>` : ""}
                ${a.question_id ? `<br/><span style="font-size:11px;color:var(--primary);">Q: ${App.esc(a.question_id)}</span>` : ""}
              </div>
            </div>
          `;
        }).join("")
      : `<div class="empty-state">${t("no_actions")}</div>`;

    return `
      <div class="readiness-banner">${App.esc(banner)}</div>
      <div style="text-align:center;margin-bottom:12px;">
        <span class="readiness-class-badge ${cssClass}">${cls.replace(/_/g, " ")}</span>
        <div style="font-size:12px;color:var(--text-light);">Checklist ${App.esc(version)}</div>
      </div>
      <div class="rule-list">
        <h3>${t("readiness_title")}</h3>
        ${rules}
      </div>
      <div class="actions-list">
        <h3>${t("actions_title")} ${actions.length > 0 ? `<span class="col-count">${actions.length}</span>` : ""}</h3>
        ${actionHTML}
      </div>
      <div class="detail-nav">
        <button class="btn-primary" onclick="App.goDraft()">${t("view_draft")}</button>
      </div>
    `;
  },
};
