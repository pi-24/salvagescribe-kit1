// public/js/api.js — API client for SalvageScribe backend

const API = {
  async getParts() {
    const r = await fetch("/api/parts");
    return r.json();
  },

  async getPart(id) {
    const r = await fetch(`/api/parts/${id}`);
    return r.json();
  },

  async ingestPart(id) {
    const r = await fetch(`/api/parts/${id}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    return r.json();
  },

  async getQuestions(id, lang) {
    const r = await fetch(`/api/parts/${id}/questions?lang=${lang}`);
    return r.json();
  },

  async confirm(id, attribute, value, lang) {
    const r = await fetch(`/api/parts/${id}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attribute, value, lang }),
    });
    return r.json();
  },

  async getDraft(id) {
    const r = await fetch(`/api/parts/${id}/draft`);
    return r.json();
  },

  async saveDraftEdit(id, edits) {
    const r = await fetch(`/api/parts/${id}/draft/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(edits),
    });
    return r.json();
  },

  async getReadiness(id) {
    const r = await fetch(`/api/parts/${id}/readiness`);
    return r.json();
  },

  async approve(id) {
    const r = await fetch(`/api/parts/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    return { status: r.status, data: await r.json() };
  },

  async ask(id, text, lang) {
    const r = await fetch(`/api/parts/${id}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang }),
    });
    return r.json();
  },
};
