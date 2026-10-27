// public/js/board.js — Board screen (3 columns, live card movement)

const Board = {
  parts: [],

  async load() {
    try {
      const data = await API.getParts();
      this.parts = data.parts || [];
      // Auto-ingest each part if not yet ingested (in MOCK mode this loads canned responses)
      for (const part of this.parts) {
        if (part.classification === null || part.classification === undefined) {
          try { await API.ingestPart(part.part_id); } catch {}
        }
      }
      // Re-fetch after ingest
      const data2 = await API.getParts();
      this.parts = data2.parts || [];
      this.render();
    } catch (err) {
      document.getElementById("col-ready").innerHTML = `<div class="loading">Error: ${err.message}</div>`;
    }
  },

  render() {
    const cols = {
      READY_FOR_REVIEW: document.getElementById("col-ready"),
      INFO_MISSING: document.getElementById("col-info"),
      SPECIALIST_REVIEW: document.getElementById("col-specialist"),
    };

    // Clear
    Object.values(cols).forEach((c) => c.innerHTML = "");

    // Counts
    let counts = { READY_FOR_REVIEW: 0, INFO_MISSING: 0, SPECIALIST_REVIEW: 0 };

    for (const part of this.parts) {
      const cls = part.classification || "INFO_MISSING";
      const cssClass = App.classToCss(cls);
      counts[cls] = (counts[cls] || 0) + 1;

      const card = document.createElement("div");
      card.className = `card ${cssClass} card-transition`;
      card.onclick = () => App.goDetail(part.part_id);
      card.innerHTML = `
        <div class="card-thumb">🪞</div>
        <div class="card-id">${App.esc(part.part_id)}</div>
        <div class="card-title">${App.esc(part.title || "")}</div>
        <div class="card-questions">${part.open_questions} open</div>
      `;
      cols[cls]?.appendChild(card);
    }

    document.getElementById("count-ready").textContent = counts.READY_FOR_REVIEW;
    document.getElementById("count-info").textContent = counts.INFO_MISSING;
    document.getElementById("count-specialist").textContent = counts.SPECIALIST_REVIEW;
  },

  // Called after a confirm to update a single card's position live
  async refreshPart(partId) {
    const data = await API.getParts();
    this.parts = data.parts || [];
    this.render();
  },
};
