// public/js/detail.js — Part detail screen

const Detail = {
  part: null,
  questions: [],

  async load(partId) {
    Assistant.clear();

    // Ingest if needed (populates photo-based attributes from mock responses)
    try {
      await API.ingestPart(partId);
    } catch {}

    // Load full ledger + questions in parallel
    try {
      const [partData, qData] = await Promise.all([
        API.getPart(partId),
        API.getQuestions(partId, currentLang),
      ]);
      this.part = partData;
      this.questions = qData.questions || [];
      this.render();
    } catch (err) {
      document.getElementById("ledger-table").innerHTML = `<div class="loading">Error: ${err.message}</div>`;
    }
  },

  render() {
    if (!this.part) return;
    this.renderPhotoStrip();
    this.renderLedger();
    this.renderQuestions();
    Assistant.render();
  },

  renderPhotoStrip() {
    const strip = document.getElementById("photo-strip");
    const photos = this.part.photos || [];
    strip.innerHTML = photos
      .map((p) => `
        <div class="photo-thumb" title="${App.esc(p.file)}">
          <span class="photo-icon">📷</span>
          <span class="photo-label">${App.esc(p.shows || p.file)}</span>
        </div>
      `)
      .join("");
    if (photos.length === 0) {
      strip.innerHTML = '<div class="empty-state">No photos</div>';
    }
  },

  renderLedger() {
    const section = document.getElementById("ledger-table");
    const entries = Object.entries(this.part.ledger || {});

    section.innerHTML = `
      <h3>${t("ledger_title")}</h3>
      <table class="ledger-table">
        <thead>
          <tr>
            <th>${currentLang === "ar" ? "السمة" : "Attribute"}</th>
            <th>${currentLang === "ar" ? "القيمة" : "Value"}</th>
            <th>${currentLang === "ar" ? "المصدر" : "Source"}</th>
            <th>${currentLang === "ar" ? "الحالة" : "Status"}</th>
          </tr>
        </thead>
        <tbody>
          ${entries
            .map(([attr, row]) => {
              const val = row.value === null || row.value === undefined
                ? '<span style="color:#94a3b8">—</span>'
                : App.esc(String(row.value));
              const source = row.candidates?.length > 0
                ? App.esc(row.candidates[0].source)
                : '<span style="color:#94a3b8">—</span>';
              return `
                <tr>
                  <td class="attr-name">${App.esc(attr)}</td>
                  <td>${val}</td>
                  <td><span class="source-badge">${source}</span></td>
                  <td><span class="status-badge status-${row.status}">${row.status}</span></td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    `;
  },

  renderQuestions() {
    const section = document.getElementById("questions-panel");
    const qs = this.questions;

    if (!qs || qs.length === 0) {
      section.innerHTML = `<h3>${t("questions_title")}</h3><div class="empty-state">${t("no_questions")}</div>`;
      return;
    }

    section.innerHTML = `
      <h3>${t("questions_title")} <span class="col-count">${qs.length}</span></h3>
      ${qs
        .map((q, i) => {
          const priorityClass = i < 3 ? "priority-high" : "priority-med";
          const options = q.options
            ? `<select id="q-input-${App.esc(q.attribute)}">
                <option value="">${currentLang === "ar" ? "اختر..." : "Select..."}</option>
                ${q.options.map((o) => `<option value="${App.esc(o)}">${App.esc(o)}</option>`).join("")}
              </select>`
            : `<input type="text" id="q-input-${App.esc(q.attribute)}" placeholder="${currentLang === "ar" ? "اكتب الإجابة..." : "Type answer..."}" />`;

          return `
            <div class="question-item ${priorityClass}" data-question-id="${App.esc(q.question_id)}">
              <div class="question-text">${App.esc(q.text)}</div>
              <div class="question-why">${App.esc(q.why)}</div>
              ${q.evidence && q.evidence.length > 0 ? `<div class="question-evidence">📎 ${q.evidence.map(App.esc).join(", ")}</div>` : ""}
              <div class="question-input-row">
                ${options}
                <button class="btn-confirm" onclick="Detail.confirmAttr('${App.esc(q.attribute)}')">${t("confirm")}</button>
              </div>
              <div id="q-result-${App.esc(q.attribute)}"></div>
            </div>
          `;
        })
        .join("")}
    `;
  },

  async confirmAttr(attribute) {
    const input = document.getElementById(`q-input-${attribute}`);
    if (!input) return;
    const value = input.value.trim();
    if (!value) return;

    const resultEl = document.getElementById(`q-result-${attribute}`);
    resultEl.innerHTML = `<span style="color:var(--text-light)">${t("saving")}</span>`;

    try {
      const result = await API.confirm(this.part.part_id, attribute, value, currentLang);
      // Update local state
      this.part = result.ledger;
      // Re-render ledger + questions
      const qData = await API.getQuestions(this.part.part_id, currentLang);
      this.questions = qData.questions || [];
      this.render();

      // Refresh board in background (card may move)
      Board.refreshPart(this.part.part_id);
    } catch (err) {
      resultEl.innerHTML = `<span style="color:var(--specialist)">Error: ${err.message}</span>`;
    }
  },
};
