// public/js/app.js — SPA router + global state

const App = {
  currentScreen: "board",
  currentPartId: null,
  currentPart: null,
  parts: [],

  async init() {
    // Set banner
    document.getElementById("banner-footer").textContent = t("banner");

    // Lang toggle
    document.getElementById("lang-toggle").addEventListener("click", () => {
      setLang(currentLang === "en" ? "ar" : "en");
      document.getElementById("banner-footer").textContent = t("banner");
    });

    // Nav tabs
    document.querySelectorAll(".nav-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const screen = tab.getAttribute("data-screen");
        if (screen === "board") this.goBoard();
        else if (screen === "detail" && this.currentPartId) this.showScreen("detail");
        else if (screen === "draft" && this.currentPartId) this.goDraft();
        else if (screen === "readiness" && this.currentPartId) this.goReadiness();
      });
    });

    // Assistant send
    document.getElementById("assistant-send").addEventListener("click", () => {
      Assistant.send();
    });
    document.getElementById("assistant-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") Assistant.send();
    });

    // Load board
    await Board.load();
  },

  showScreen(screen) {
    this.currentScreen = screen;
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    document.getElementById(`screen-${screen}`).classList.add("active");

    // Show/hide nav tabs
    const showDetail = !!this.currentPartId;
    document.querySelector('.nav-tab[data-screen="detail"]').style.display = showDetail ? "" : "none";
    document.querySelector('.nav-tab[data-screen="draft"]').style.display = showDetail ? "" : "none";
    document.querySelector('.nav-tab[data-screen="readiness"]').style.display = showDetail ? "" : "none";

    document.querySelectorAll(".nav-tab").forEach((tab) => {
      tab.classList.toggle("active", tab.getAttribute("data-screen") === screen);
    });

    window.scrollTo(0, 0);
  },

  goBoard() {
    this.showScreen("board");
    Board.load();
  },

  async goDetail(partId) {
    if (partId) this.currentPartId = partId;
    this.showScreen("detail");
    document.getElementById("banner-footer").textContent = t("banner");
    await Detail.load(this.currentPartId);
  },

  async goDraft() {
    if (!this.currentPartId) return;
    this.showScreen("draft");
    await Draft.load(this.currentPartId);
  },

  async goReadiness() {
    if (!this.currentPartId) return;
    this.showScreen("readiness");
    await Readiness.load(this.currentPartId);
  },

  async renderCurrentScreen() {
    if (this.currentScreen === "board") Board.render();
    else if (this.currentScreen === "detail" && this.currentPartId) Detail.render();
    else if (this.currentScreen === "draft" && this.currentPartId) Draft.render();
    else if (this.currentScreen === "readiness" && this.currentPartId) Readiness.render();
  },

  // Helper: classification → short CSS class
  classToCss(cls) {
    if (cls === "READY_FOR_REVIEW") return "ready";
    if (cls === "INFO_MISSING") return "info";
    if (cls === "SPECIALIST_REVIEW") return "specialist";
    return "info";
  },

  // Helper: escape HTML
  esc(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },
};

// ── Assistant (embedded in detail screen) ─────────────────────────────────

const Assistant = {
  messages: [],

  async send() {
    const input = document.getElementById("assistant-input");
    const text = input.value.trim();
    if (!text || !App.currentPartId) return;

    this.messages.push({ role: "user", text });
    input.value = "";
    this.render();

    try {
      const result = await API.ask(App.currentPartId, text, currentLang);
      this.messages.push({
        role: "bot",
        text: result.reply,
        suggested_question_id: result.suggested_question_id,
        suggested_attribute: result.suggested_attribute,
      });
    } catch (err) {
      this.messages.push({ role: "bot", text: "Error: " + err.message });
    }
    this.render();
  },

  render() {
    const container = document.getElementById("assistant-messages");
    if (!container) return;
    container.innerHTML = this.messages
      .map((msg) => {
        if (msg.role === "user") {
          return `<div class="assistant-msg user">${App.esc(msg.text)}</div>`;
        }
        let html = `<div class="assistant-msg bot">${App.esc(msg.text)}`;
        if (msg.suggested_question_id) {
          html += `<div class="suggested-q">${t("suggested_question")} <button onclick="Assistant.answerQuestion('${msg.suggested_question_id}', '${msg.suggested_attribute || ""}')">${t("answer_question")}</button></div>`;
        }
        html += `</div>`;
        return html;
      })
      .join("");
    container.scrollTop = container.scrollHeight;
  },

  answerQuestion(qid, attr) {
    // Scroll to the question in the questions panel
    const qEl = document.querySelector(`[data-question-id="${qid}"]`);
    if (qEl) {
      qEl.scrollIntoView({ behavior: "smooth", block: "center" });
      qEl.style.background = "#fffbeb";
      setTimeout(() => { qEl.style.background = ""; }, 1500);
    }
  },

  clear() {
    this.messages = [];
    this.render();
  },
};

// ── Boot ──────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  App.init();
});
