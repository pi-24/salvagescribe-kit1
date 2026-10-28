"use strict";
const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
// Each supplied listing carries its own exact thumbnail mapping from the catalog.
const DEFAULT_THUMBNAIL = "/marketglass/images/image-unavailable.svg";
function thumbnailFor(record) {
  const ledger = record.ledger;
  const specified = record.thumbnail || record.img || record.image_url || record.listing?.imageUrl || ledger.thumbnail || ledger.spreadsheet_row?.thumbnail;
  const photo = ledger.photos?.find(p => p.url);
  return (typeof specified === "string" && specified) || photo?.url || DEFAULT_THUMBNAIL;
}
function bindThumbnailFallbacks(scope) {
  scope.querySelectorAll("img[data-item-thumbnail]").forEach(img => {
    img.addEventListener("error", () => {
      if (img.dataset.fallbackApplied) return;
      img.dataset.fallbackApplied = "true";
      img.src = DEFAULT_THUMBNAIL;
    });
  });
}
const state = { category: "all", search: "", sort: "recent", layout: "box", corridor: false, currentPart: null, lang: "en" };
let LISTINGS = [], records = [], user = null, preview = true, setupError = "", toastTimer;
const labels = { READY_FOR_REVIEW: "Ready for seller review", INFO_MISSING: "Information missing", SPECIALIST_REVIEW: "Specialist review" };
async function api(url, body) {
  const response = await fetch(url, { cache: "no-store", ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || "The request failed. Please try again.");
    error.status = response.status;
    throw error;
  }
  return data;
}
function toast(message) {
  let el = document.querySelector(".marketglass-toast");
  if (!el) { el = document.createElement("div"); el.className = "marketglass-toast"; el.setAttribute("role", "status"); document.body.append(el); }
  el.textContent = message; el.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 6000);
}
const attr = (r, key) => r?.ledger.ledger[key]?.value;
const current = () => records.find(r => r.part_id === state.currentPart?.id);
function syncListings() {
  LISTINGS = records.map((r, i) => {
    const listing = r.listing || r.ledger.marketplace_listing;
    return {
      id: r.part_id, listingId: listing?.id || r.part_id, listing, img: thumbnailFor(r),
      cat: listing?.category || (/mirror/i.test(r.ledger.spreadsheet_row?.description) ? "mirrors" : /light/i.test(r.ledger.spreadsheet_row?.description) ? "lights" : "body"),
      title: listing?.title || r.ledger.spreadsheet_row?.description || r.part_id,
      donor: listing?.donorVehicle || [attr(r,"donor_make"), attr(r,"donor_model"), attr(r,"donor_year")].filter(Boolean).join(" "),
      partNum: listing?.partNumber || attr(r,"part_number") || "Not confirmed",
      priceAed: Number(listing?.price ?? attr(r,"asking_price") ?? r.ledger.spreadsheet_row?.price_aed) || null,
      readiness: listing ? listing.readinessClass === "readiness-ready" ? "ready" : listing.readinessClass === "readiness-conflict" ? "specialist" : "missing" : r.readiness.class === "READY_FOR_REVIEW" ? "ready" : r.readiness.class === "SPECIALIST_REVIEW" ? "specialist" : "missing",
      record: r, recent: i,
    };
  });
  if (state.currentPart) state.currentPart = LISTINGS.find(r => r.id === state.currentPart.id);
  state.currentPart ||= LISTINGS[0];
  const all = document.querySelector('.chip[data-category="all"]');
  all.lastChild.textContent = ` All Salvage Inventory (${records.length})`;
  renderListings();
}
function visibleListings() {
  const q = state.search.toLowerCase();
  const rows = LISTINGS.filter(r => (state.category === "all" || (state.category === "ready" ? r.readiness === "ready" : r.cat === state.category)) && (!q || [r.id,r.title,r.donor,r.partNum].join(" ").toLowerCase().includes(q)));
  return rows.sort(({ priceAed:a, recent:ai, readiness:ar }, { priceAed:b, recent:bi, readiness:br }) => state.sort === "price-asc" ? (a ?? Infinity)-(b ?? Infinity) : state.sort === "price-desc" ? (b ?? -Infinity)-(a ?? -Infinity) : state.sort === "readiness" ? ar.localeCompare(br) : ai-bi);
}
function renderListings() {
  const wrap = $("listingsContainer");
  wrap.className = state.layout === "box" ? "marketplace-box-grid" : "marketplace-list-grid";
  wrap.innerHTML = visibleListings().map(r => `<article class="glass-card" data-listing-id="${esc(r.listingId)}"><div class="card-canvas"><img class="card-img" data-item-thumbnail data-thumbnail-source="${esc(r.listing?.imageUrl || r.img)}" src="${esc(r.img)}" alt="${esc(r.title)} — ${esc(r.id)} thumbnail" loading="lazy" decoding="async" width="640" height="480"/><div class="card-badges-top"><span class="glass-badge">${esc(r.listing?.readinessStatus || labels[r.record.readiness.class])}</span></div></div><div class="card-body"><h2 class="card-title">${esc(r.title)}</h2><p class="card-location">${esc(r.donor || "Donor unconfirmed")} · ${esc(r.listingId)}</p>${r.listing ? `<p class="card-location">${esc(r.listing.location)} · ${esc(r.listing.timeAgo)}</p><p class="card-location">${esc(r.listing.dealRating)} · ${esc(r.listing.photoCount)} photos</p>` : ""}<p class="card-location">Part number: ${esc(r.partNum)}</p><div class="card-price-row"><strong class="card-price">${r.priceAed ? `AED ${r.priceAed.toLocaleString()}` : "Price not recorded"}</strong></div>${r.listing?.seller ? `<p class="card-location">${esc(r.listing.seller.name)} · ${esc(r.listing.seller.rating)} / 5 · ${esc(r.listing.seller.salesCount)} sales</p>` : ""}<div class="card-actions"><button class="btn-primary-liquid" data-open="${esc(r.id)}">Review evidence</button><button class="btn-subtle-liquid" data-chat="${esc(r.id)}">Message</button></div></div></article>`).join("") || '<p role="status">No parts match this filter.</p>';
  bindThumbnailFallbacks(wrap);
  wrap.querySelectorAll("[data-open]").forEach(b => b.onclick = () => { state.currentPart = LISTINGS.find(r => r.id === b.dataset.open); openSalvageAssistant(); });
  wrap.querySelectorAll("[data-chat]").forEach(b => b.onclick = () => openChatDrawerFor(b.dataset.chat));
}
/* Filters */
function bindFeedControls() {
  document.querySelectorAll(".chip[data-category]").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".chip[data-category]").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      state.category = chip.dataset.category;
      renderListings();
    });
  });
  $("searchInput").addEventListener("input", (e) => { state.search = e.target.value.trim(); renderListings(); });
  $("sortSelect").addEventListener("change", (e) => { state.sort = e.target.value; renderListings(); });
  $("layoutBtnBox").addEventListener("click", () => {
    state.layout = "box";
    $("layoutBtnBox").classList.add("active"); $("layoutBtnList").classList.remove("active");
    renderListings();
  });
  $("layoutBtnList").addEventListener("click", () => {
    state.layout = "list";
    $("layoutBtnList").classList.add("active"); $("layoutBtnBox").classList.remove("active");
    renderListings();
  });
}

function resetToLandingPage() {
  state.category = "all"; state.search = ""; state.corridor = false;
  $("searchInput").value = "";
  document.querySelectorAll(".chip[data-category]").forEach((c) => c.classList.toggle("active", c.dataset.category === "all"));
  $("corridorRiskBanner").style.display = "none";
  renderListings();
  toast("Returned to full salvage inventory feed");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function handleCorridorButtonClick() {
  state.corridor = !state.corridor;
  state.category = state.corridor ? "ready" : "all";
  document.querySelectorAll(".chip[data-category]").forEach((c) => c.classList.toggle("active", c.dataset.category === state.category));
  $("corridorRiskBanner").style.display = state.corridor ? "flex" : "none";
  renderListings();
  toast(state.corridor ? "UAE → UK corridor filter active" : "Corridor filter cleared");
}

/* ── Theme toggle ───────────────────────────────────────────────────────── */

function bindThemeToggle() {
  const saved = localStorage.getItem("mg-theme");
  if (saved === "dark") document.documentElement.dataset.theme = "dark";
  $("themeToggleBtn").addEventListener("click", () => {
    const root = document.documentElement;
    const next = root.dataset.theme === "dark" ? "" : "dark";
    if (next) root.dataset.theme = next; else delete root.dataset.theme;
    localStorage.setItem("mg-theme", next || "light");
  });
}

/* ── Analogue radial dial menu ──────────────────────────────────────────── */

const RADIAL = { open: false, progress: 0, lastIndex: 0 };
const BUBBLES = [
  { target: "all",       label: "All Salvage Parts",   desc: "Browse the existing salvage inventory." },
  { target: "mirrors",   label: "Side Mirrors",        desc: "Core demo category: heated, power-fold side-view mirrors with OEM provenance." },
  { target: "lights",    label: "Headlights & Tails",  desc: "Browse recorded headlight and taillight assemblies." },
  { target: "body",      label: "Door Handles & Trim", desc: "Exterior handles, moldings and trim panels catalogued with donor references." },
  { target: "assistant", label: "SalvageScribe AI",    desc: "Understand evidence, resolve gaps, draft, and review." },
  { target: "corridor",  label: "UAE → UK Corridor",   desc: "Filter parts ready for internal seller review." },
  { target: "chat",      label: "Noor's WhatsApp",     desc: "Open saved conversations with another registered account." },
  { target: "operator",  label: "Escrow Safety Desk",  desc: "Review the operational evidence checklist." },
];

function ellipsePoint(p) {
  // Whole circle in 2 halves: top → right → bottom → left → top
  const a = p * Math.PI * 2;
  return { x: 190 + 130 * Math.sin(a), y: 190 - 140 * Math.cos(a) };
}

function openAnalogueMenu() {
  $("analogueMenuBackdrop").setAttribute("aria-hidden", "false");
  $("btnAnalogueTrigger").setAttribute("aria-expanded", "true");
  RADIAL.open = true; RADIAL.progress = 0; RADIAL.lastIndex = -1;
  $("analogueMenuBackdrop").classList.add("open");
  $("landingBlurVeil").classList.add("active");
  $("btnAnalogueTrigger").classList.add("active");
  updateRadial();
}
function closeAnalogueMenu() {
  $("analogueMenuBackdrop").setAttribute("aria-hidden", "true");
  $("btnAnalogueTrigger").setAttribute("aria-expanded", "false");
  RADIAL.open = false;
  $("analogueMenuBackdrop").classList.remove("open");
  $("landingBlurVeil").classList.remove("active");
  $("btnAnalogueTrigger").classList.remove("active");
}

function updateRadial() {
  const p = RADIAL.progress;
  const phase = p < 0.5 ? "first" : "second";
  const panel = $("analogueMenuPanel");
  panel.dataset.radialPhase = phase;
  $("radialHubPhaseText").textContent = phase === "first" ? "1st Half" : "2nd Half";
  $("activePhaseBadge").textContent = phase === "first" ? "Phase 1/2" : "Phase 2/2";

  const idx = Math.min(3, Math.floor((p * 2) % 1 * 4));
  const bubble = BUBBLES[phase === "first" ? idx : idx + 4];

  document.querySelectorAll(".radial-bubble-item").forEach((el) => {
    const isActivePhase = el.dataset.phase === phase;
    el.classList.toggle("emerged", isActivePhase);
    el.classList.toggle("retracted", !isActivePhase);
    el.classList.toggle("is-cursor-active", isActivePhase && Number(el.dataset.index) % 4 === idx);
  });

  // Bead rides the ellipse rail
  const pt = ellipsePoint(p);
  const bead = $("radialScrollBead");
  bead.style.left = pt.x + "px";
  bead.style.top = pt.y + "px";

  // Magnetic liquid cursor snaps onto the aimed bubble
  const bubbleEl = document.querySelector(`.radial-bubble-item[data-index="${phase === "first" ? idx : idx + 4}"]`);
  const cursor = $("radialLiquidCursor");
  if (bubbleEl) {
    const bx = parseFloat(bubbleEl.style.left);
    const by = parseFloat(bubbleEl.style.top);
    cursor.classList.add("active");
    cursor.style.left = bx + "px";
    cursor.style.top = by + "px";
  }

  $("radialHubSubText").textContent = bubble.label;
  $("activeCategoryBadge").textContent = "Aimed: " + bubble.label;
  $("activeCategoryDesc").textContent = bubble.desc;
}

function bindRadialMenu() {
  $("btnAnalogueTrigger").addEventListener("click", () => (RADIAL.open ? closeAnalogueMenu() : openAnalogueMenu()));
  $("btnCloseAnalogueMenu").addEventListener("click", closeAnalogueMenu);
  $("landingBlurVeil").addEventListener("click", closeAnalogueMenu);
  $("analogueMenuBackdrop").addEventListener("click", (e) => { if (e.target === $("analogueMenuBackdrop")) closeAnalogueMenu(); });

  // Gentle calibrated scroll across the two half-arcs
  const stage = $("radialScrollStage");
  stage.addEventListener("wheel", (e) => {
    e.preventDefault();
    RADIAL.progress = Math.min(1, Math.max(0, RADIAL.progress + e.deltaY * 0.0006));
    updateRadial();
  }, { passive: false });

  let touchY = null;
  stage.addEventListener("touchstart", (e) => { touchY = e.touches[0].clientY; }, { passive: true });
  stage.addEventListener("touchmove", (e) => {
    if (touchY === null) return;
    const dy = touchY - e.touches[0].clientY;
    touchY = e.touches[0].clientY;
    RADIAL.progress = Math.min(1, Math.max(0, RADIAL.progress + dy * 0.004));
    updateRadial();
  }, { passive: true });

  function selectAimed() {
    const p = RADIAL.progress;
    const phase = p < 0.5 ? "first" : "second";
    const idx = Math.min(3, Math.floor((p * 2) % 1 * 4));
    selectRadialTarget(BUBBLES[phase === "first" ? idx : idx + 4].target);
  }
  stage.addEventListener("click", selectAimed);
  document.querySelectorAll(".radial-bubble-item").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      selectRadialTarget(el.dataset.target);
    });
  });
}

function selectRadialTarget(target) {
  closeAnalogueMenu();
  if (target === "assistant") return openSalvageAssistant();
  if (target === "chat") return openChatDrawer();
  if (target === "corridor") return handleCorridorButtonClick();
  if (target === "operator") { openSalvageAssistant(); switchAssistantTab("compliance"); return; }
  state.category = target;
  state.corridor = false;
  $("corridorRiskBanner").style.display = "none";
  document.querySelectorAll(".chip[data-category]").forEach((c) => c.classList.toggle("active", c.dataset.category === target));
  const labels = { all: "All Salvage Parts", mirrors: "Side Mirrors", lights: "Headlights & Taillights", body: "Door Handles & Trim" };
  toast("Filtered: " + labels[target]);
  renderListings();
}

let modalFocus;
function openSalvageAssistant() {
  if (!current()) return toast("No inventory is available yet. Import the existing inventory or intake a part.");
  modalFocus = document.activeElement;
  renderRecord();
  $("salvageAssistantModal").classList.add("open");
  $("salvageAssistantModal").setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  switchAssistantTab("stage1");
  document.querySelector(".btn-close-salvage").focus();
}
function closeSalvageAssistant() { $("salvageAssistantModal").classList.remove("open"); $("salvageAssistantModal").setAttribute("aria-hidden", "true"); document.body.style.overflow = ""; modalFocus?.focus(); }
function switchAssistantTab(tab) {
  document.querySelectorAll(".salvage-tab-btn").forEach(b => { b.classList.toggle("active", b.dataset.tab === tab); b.setAttribute("aria-selected", String(b.dataset.tab === tab)); });
  document.querySelectorAll(".salvage-panel").forEach(p => p.classList.toggle("active", p.id === "panel" + tab.charAt(0).toUpperCase() + tab.slice(1)));
}
function openAssistantComplianceTab() { openSalvageAssistant(); switchAssistantTab("compliance"); }
function loadTestCase(mode) { const r = LISTINGS.find(r => r.id === (mode === "normal" ? "SALVAGE-2" : "SALVAGE-1")); if (!r) return toast("This part is not in your saved inventory."); state.currentPart = r; renderRecord(); switchAssistantTab("stage1"); }
function setAssistantLanguage(lang) { state.lang = lang; $("btnLangEN").classList.toggle("active", lang === "en"); $("btnLangAR").classList.toggle("active", lang === "ar"); renderRecord(); }
function renderRecord() {
  const r = current(); if (!r) return;
  const l = r.ledger;
  $("assistantMainHeading").textContent = state.lang === "ar" ? "مساعد إدراج قطع الغيار" : "Automotive Salvage Listing Assistant";
  $("assistantSubHeading").textContent = `${r.part_id} · ${l.spreadsheet_row?.description || "Part"} · ${preview ? "Existing source preview" : `Saved revision ${r.revision}`}`;
  $("trustBoundaryText").textContent = "Evidence is traced to its source. Unconfirmed fitment and testing remain unverified. This checklist is for internal review; final approval belongs to the seller.";
  $("tab2ConflictBadge").textContent = `${Object.values(l.ledger).filter(a => a.status === "CONFLICTING").length} conflicts`;
  $("tab4StatusBadge").textContent = labels[r.readiness.class];
  $("tabComplianceBadge").textContent = "Internal checklist";
  const sourceMarkup = l.photos.map(p => `<div class="glass-panel" style="padding:14px">${p.url ? `<img src="${esc(p.url)}" alt="${esc(p.shows || p.file)}" style="max-width:100%;max-height:180px"/>` : `<strong>${esc(p.file || p.name || "Photo reference")}</strong>`}<p>${esc(p.shows || "Uploaded evidence")}</p></div>`).join("");
  $("panelStage1").innerHTML = `<div class="inventory-evidence-grid"><section class="source-evidence-card"><h3 class="card-section-heading">${state.lang === "ar" ? "مصادر الأدلة" : "Source evidence"}</h3><figure class="record-thumbnail"><img data-item-thumbnail src="${esc(thumbnailFor(r))}" alt="${esc(state.currentPart.title)} thumbnail" width="640" height="480"/><figcaption>Listing thumbnail</figcaption></figure><h4>Inventory spreadsheet</h4><pre class="raw-snippet" style="white-space:pre-wrap">${esc(JSON.stringify(l.spreadsheet_row, null, 2))}</pre><h4>Yard notes · English</h4><p>${esc(l.notes.en || "No English note recorded")}</p><h4>ملاحظات الساحة</h4><p dir="rtl" lang="ar">${esc(l.notes.ar || "لا توجد ملاحظات")}</p><h4>Photo evidence</h4><div class="source-photos-grid">${sourceMarkup || "No photos recorded"}</div></section><section class="provenance-ledger-card"><h3 class="card-section-heading">Evidence ledger · ${esc(r.part_id)}</h3><div style="overflow:auto"><table class="provenance-table"><thead><tr><th>Attribute</th><th>Value</th><th>Source</th><th>Status</th></tr></thead><tbody>${Object.entries(l.ledger).map(([key,a]) => `<tr><td>${esc(key.replaceAll("_"," "))}</td><td>${esc(a.value ?? "Not confirmed")}</td><td>${esc(a.source || (a.candidates || []).map(c => c.source).filter(Boolean).join(", ") || "—")}</td><td>${esc(a.status)}</td></tr>`).join("")}</tbody></table></div></section></div><div class="evidence-actions"><button class="btn-primary-liquid" onclick="runAction('ingest')">Extract evidence</button><button class="btn-subtle-liquid" onclick="switchAssistantTab('stage2')">Resolve gaps & conflicts</button></div>`;
  bindThumbnailFallbacks($("panelStage1"));
  $("panelStage2").innerHTML = `<div class="conflict-alert-card"><h3>${state.lang === "ar" ? "أكد المعلومات من المصدر" : "Confirm attributes from source evidence"}</h3><p>Only enter values you have checked. Blank fields stay unresolved. Saving updates the ledger, draft and readiness together.</p></div><form id="correctionForm"><div class="questions-grid">${Object.entries(l.ledger).map(([key,a]) => `<div class="question-card evidence-field"><label for="field-${esc(key)}">${esc(key.replaceAll("_"," "))} · ${esc(a.status)}</label>${key === "tested" ? `<select id="field-${key}" class="glass-text-input" name="${key}"><option value="">Choose recorded status</option>${["tested_ok","tested_fault","untested"].map(v => `<option value="${v}" ${a.value === v ? "selected" : ""}>${v.replaceAll("_"," ")}</option>`).join("")}</select>` : `<input id="field-${esc(key)}" class="glass-text-input" name="${esc(key)}" value="${esc(a.value ?? "")}" placeholder="Not confirmed" ${a.status === "VERIFIED" ? "data-confirmed" : ""}/>`}<label style="font-weight:400"><input type="checkbox" name="verify-${esc(key)}"/> Confirm this recorded value</label><small>${esc((a.candidates || []).map(c => `${c.value} (${c.source})`).join(" · ") || "No source candidates")}</small></div>`).join("")}</div><div class="evidence-actions"><button type="submit" class="btn-primary-liquid">Save corrections & carry over</button></div></form>`;
  $("correctionForm").onsubmit = e => {
    e.preventDefault(); const changes = {};
    for (const [key,v] of new FormData(e.target)) if (l.ledger[key] && v.trim() && (String(l.ledger[key].value ?? "") !== v.trim() || e.target.elements.namedItem(`verify-${key}`)?.checked)) changes[key] = v.trim();
    if (!Object.keys(changes).length) return toast("Enter a correction or confirm an unresolved value first.");
    runAction("confirm", { changes });
  };
  const draft = r.draft;
  $("panelStage3").innerHTML = `<div class="draft-journey-grid"><section class="draft-editor-card"><h3 class="card-section-heading">Listing draft · human approval required</h3>${draft ? `<form id="draftForm"><label for="draftTitleInput">Title · maximum 80 characters</label><input id="draftTitleInput" class="glass-text-input" value="${esc(draft.title)}" maxlength="80" required oninput="updateCharCounter(this)"/><span id="titleCharCount">${draft.title.length}/80</span><label for="draftConditionDesc">Description & condition disclosure</label><textarea id="draftConditionDesc" class="glass-textarea" rows="12" required>${esc(draft.description_markdown)}</textarea><div class="evidence-actions"><button class="btn-primary-liquid" type="submit">Save draft edits</button><button class="btn-subtle-liquid" type="button" onclick="exportDraft()">Download draft JSON</button></div></form>` : '<p>No draft has been generated for this part.</p>'}<div class="evidence-actions"><button class="btn-primary-liquid" onclick="runAction('generate')">${draft ? "Regenerate from ledger" : "Generate listing draft"}</button></div></section><section class="draft-preview-card"><h3 class="card-section-heading">Recorded fitment boundary</h3><p>${esc(draft?.compatibility?.donor_vehicle_recorded || state.currentPart.donor || "Donor not confirmed")}</p><p>${esc(draft?.compatibility?.unverified_statement || "Unverified / Buyer to Verify. Confirm by part number before purchase.")}</p><h4>Item specifics</h4><pre style="white-space:pre-wrap">${esc(JSON.stringify(draft?.item_specifics || {},null,2))}</pre><p>${draft?.approved ? "Approved by seller · remains a draft" : "Not approved"}</p></section></div>`;
  if ($("draftForm")) $("draftForm").onsubmit = e => { e.preventDefault(); runAction("edit", { title: $("draftTitleInput").value, description_markdown: $("draftConditionDesc").value }); };
  $("panelStage4").innerHTML = `<div class="readiness-status-banner"><div><h3>${esc(labels[r.readiness.class])}</h3><p>${esc(r.readiness.banner)}</p><small>${esc(r.readiness.checklist_version)}</small></div></div><div class="checklist-grid">${r.readiness.rules.map(rule => `<div class="check-item-card ${rule.result === "PASS" ? "done" : ""}"><div class="check-content"><strong>${esc(rule.id)}</strong><p>${esc(rule.detail)}</p></div><span class="check-tag">${esc(rule.result)}</span></div>`).join("")}</div><div class="evidence-actions"><button id="btnApproveListing" class="btn-approve-liquid" onclick="approveListingDraft()" ${r.readiness.class !== "READY_FOR_REVIEW" || !draft ? "disabled" : ""}>Approve listing draft</button></div>`;
  $("panelCompliance").innerHTML = `<div class="readiness-status-banner"><div><h3>UAE → UK operational review</h3><p>${esc(r.readiness.banner)}</p></div></div><div class="compliance-pillars-grid">${r.readiness.rules.map(rule => `<section class="question-card"><h3>${esc(rule.id)} · ${esc(rule.result)}</h3><p>${esc(rule.detail)}</p></section>`).join("")}</div><div class="evidence-actions"><button class="btn-subtle-liquid" onclick="generateCustomsInvoice()">Download internal checklist</button></div>`;
  $("panelStage5").innerHTML = `<section class="benchmark-card"><h3 class="card-section-heading">Inventory review metrics</h3><p>Calculated from the loaded records.</p><table class="benchmark-table"><tbody><tr><td>Parts in inventory</td><td>${records.length}</td></tr><tr><td>Ready for seller review</td><td>${records.filter(r => r.readiness.class === "READY_FOR_REVIEW").length}</td></tr><tr><td>Information missing</td><td>${records.filter(r => r.readiness.class === "INFO_MISSING").length}</td></tr><tr><td>Specialist review</td><td>${records.filter(r => r.readiness.class === "SPECIALIST_REVIEW").length}</td></tr><tr><td>Selected part · verified attributes</td><td>${Object.values(l.ledger).filter(a=>a.status === "VERIFIED").length} / ${Object.keys(l.ledger).length}</td></tr></tbody></table><p>Time savings and accuracy improvements require a measured pilot; no benchmark claims are assumed.</p></section>`;
}
let actionBusy = false;
async function runAction(action, extra = {}) {
  if (actionBusy) return;
  if (!user) { window.location.assign("/login?next=%2F"); return; }
  if (current()?.preview) return toast(setupError || "Import the catalog before saving changes.");
  actionBusy = true;
  const buttons = [...$("salvageAssistantModal").querySelectorAll("button")];
  const disabled = buttons.map(b => b.disabled); buttons.forEach(b => b.disabled = true);
  try {
    const r = current();
    const { record } = await api("/api/platform", { action, part_id: r.part_id, revision: r.revision, lang: state.lang, ...extra });
    records = records.map(r => r.part_id === record.part_id ? record : r);
    syncListings(); renderRecord(); toast("Saved. Evidence, draft and readiness are up to date.");
  } catch (err) { toast(err.message); } finally { buttons.forEach((b,i) => b.disabled = disabled[i]); actionBusy = false; }
}
function approveListingDraft() { return runAction("approve"); }
function updateCharCounter(input) { $("titleCharCount").textContent = `${input.value.length}/80`; }
function download(name, data) { const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)], {type:"application/json"})); const a=document.createElement("a"); a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); }
function exportDraft() { download(`${current().part_id}-draft.json`, current().draft); }
function generateCustomsInvoice() { download(`${current().part_id}-internal-checklist.json`, current().readiness); }
function certifyComplianceDossier() { toast("Review and confirm the outstanding evidence before seller approval."); }
let activeThread = null;
async function openChatDrawerFor(id) { state.currentPart = LISTINGS.find(r=>r.id === id) || state.currentPart; await openChatDrawer(); }
function appendMessage(text, sent) {
  const row = document.createElement("div"); row.className = `msg-row ${sent ? "sent" : "received"}`;
  const bubble = document.createElement("div"); bubble.className = "msg-bubble"; bubble.textContent = text; row.append(bubble); $("messagesCanvas").append(row);
}
async function openChatDrawer() {
  $("m2mDrawer").classList.add("open"); $("floatingChatPill").classList.add("hidden");
  $("drawerSellerName").textContent = "Inventory conversations";
  document.querySelector(".drawer-header-info p").textContent = "Messages are saved to your account";
  $("drawerSellerAvatar").style.display = "none";
  $("anchorThumb").style.display = "";
  $("anchorThumb").src = state.currentPart?.img || DEFAULT_THUMBNAIL;
  $("anchorThumb").alt = `${state.currentPart?.title || "Inventory item"} thumbnail`;
  $("anchorThumb").onerror = () => { $("anchorThumb").onerror = null; $("anchorThumb").src = DEFAULT_THUMBNAIL; };
  $("anchorTitle").textContent = state.currentPart?.title || "Select a part";
  $("anchorPrice").textContent = state.currentPart?.priceAed ? `AED ${state.currentPart.priceAed}` : "Price not recorded";
  const canvas = $("messagesCanvas"); canvas.innerHTML = ""; activeThread = null;
  if (!user || current()?.preview) { appendMessage("Sign in and import inventory to create a conversation with another registered account.",false); return; }
  try {
    const { threads } = await api("/api/platform?view=threads");
    const selected = threads.filter(t => t.record_id === current()?.id || t.subject?.startsWith(state.currentPart?.id));
    const toolbar = document.createElement("div"); toolbar.innerHTML = `<label for="threadSelect">Conversation</label><select id="threadSelect" class="glass-text-input"><option value="">Select a conversation</option>${selected.map(t=>`<option value="${esc(t.id)}">${esc(t.subject)}</option>`).join("")}</select><form id="newThreadForm"><label for="recipientId">Recipient account ID</label><input id="recipientId" class="glass-text-input" required placeholder="Registered account UUID"/><button class="btn-subtle-liquid">Start conversation</button></form><small>Your account ID: ${esc(user.id)}</small>`;
    canvas.append(toolbar);
    $("threadSelect").onchange = async e => { activeThread=e.target.value; await loadMessages(); };
    $("newThreadForm").onsubmit = async e => { e.preventDefault(); try { const {thread}= await api("/api/platform",{action:"thread",part_id:current().part_id,recipient:$("recipientId").value.trim()}); const o=new Option(thread.subject,thread.id); $("threadSelect").add(o); $("threadSelect").value=thread.id;activeThread=thread.id;await loadMessages(); } catch(err){toast(err.message);} };
    if (selected[0]) { activeThread = selected[0].id; $("threadSelect").value=activeThread; await loadMessages(); }
  } catch(err) { appendMessage(err.message,false); }
}
async function loadMessages() {
  $("messagesCanvas").querySelectorAll(".msg-row").forEach(r=>r.remove());
  if (!activeThread) return;
  try { const {messages}=await api(`/api/platform?view=messages&thread_id=${encodeURIComponent(activeThread)}`); messages.forEach(m=>appendMessage(m.body,m.sender_id===user.id)); } catch(err){toast(err.message);}
}
function closeChatDrawer() { $("m2mDrawer").classList.remove("open"); $("floatingChatPill").classList.remove("hidden"); }
let sending = false;
async function sendMessage(extra = {}) {
  if (!activeThread) return toast("Choose or start a conversation first.");
  const text = $("chatInput").value.trim(); if (!text || sending) return;
  sending = true; $("btnSendMsg").disabled=true;
  try { await api("/api/platform",{ action:"message",thread_id:activeThread,text,...extra });$("chatInput").value="";await loadMessages(); } catch(err){toast(err.message);} finally { sending=false;$("btnSendMsg").disabled=false; }
}
let offerPart;
function openOfferModal(id) { if(!activeThread) return toast("Choose a conversation before making an offer."); offerPart=LISTINGS.find(r=>r.id===id)||state.currentPart; $("offerPriceInput").value=offerPart?.priceAed ? Math.round(offerPart.priceAed*.9) : "";$("makeOfferModal").showModal(); }
function toggleVoicePlayback() { toast("No recorded audio is attached to this conversation."); }
function toggleWhisperTranscript() { toast("Transcription is not configured."); }
function bindChatDrawer() {
  $("drawerCloseBtn").onclick=closeChatDrawer; $("floatingChatPill").onclick=()=>openChatDrawer();
  $("btnSendMsg").onclick=()=>sendMessage(); $("chatInput").onkeydown=e=>{if(e.key==="Enter")sendMessage();};
  $("btnMicRecord").onclick=()=>toast("Voice recording is not configured. Send a text message instead.");
  document.querySelectorAll(".quick-prompt-chip").forEach(b=>b.onclick=()=>{$("chatInput").value=b.textContent;});
  $("anchorBtnOffer").onclick=()=>openOfferModal(state.currentPart?.id);
  document.querySelectorAll(".preset-chip").forEach(b=>b.onclick=()=>{document.querySelectorAll(".preset-chip").forEach(c=>c.classList.toggle("active",b===c));$("offerPriceInput").value=Math.round((offerPart?.priceAed||0)*(1-Number(b.dataset.discount)));});
  $("offerPriceInput").min="1";$("offerPriceInput").step="0.01";
  $("btnCancelOffer").onclick=()=>$("makeOfferModal").close();
  $("btnSubmitOffer").onclick=async()=>{const amount=Number($("offerPriceInput").value);if(!Number.isFinite(amount)||amount<=0)return toast("Enter a positive offer amount.");$("chatInput").value=`Offer: AED ${amount} for ${offerPart.id}`;await sendMessage({kind:"offer",amount});$("makeOfferModal").close();};
}
function openIntake() {
  if (!user) { window.location.assign("/login?next=%2F"); return; }
  if (setupError) return toast(setupError);
  let dialog=$("intakeDialog");
  if(!dialog){dialog=document.createElement("dialog");dialog.id="intakeDialog";dialog.className="glass-modal";dialog.setAttribute("aria-label","Intake a salvage part");dialog.innerHTML=`<form id="intakeForm"><h2 class="modal-title">Intake a salvage part</h2><label for="intakeId">Part ID</label><input id="intakeId" class="modal-input-field" name="part_id" required pattern="[A-Za-z0-9][A-Za-z0-9-]{1,39}"/><label for="intakeDesc">Description</label><input id="intakeDesc" class="modal-input-field" name="description" required maxlength="200"/><label for="intakePrice">Asking price (AED)</label><input id="intakePrice" class="modal-input-field" name="price_aed" type="number" min="0.01" step="0.01"/><label for="intakeLocation">Storage location</label><input id="intakeLocation" class="modal-input-field" name="location"/><label for="intakeNote">Yard note</label><textarea id="intakeNote" class="glass-textarea" name="note_en"></textarea><label for="intakeArabic">ملاحظات بالعربية</label><textarea id="intakeArabic" class="glass-textarea" name="note_ar" dir="rtl"></textarea><div class="modal-actions"><button type="button" class="btn-modal-cancel" onclick="document.getElementById('intakeDialog').close()">Cancel</button><button type="submit" class="btn-modal-submit">Save part</button></div></form>`;document.body.append(dialog);
  $("intakeForm").onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const {record}=await api("/api/platform",{action:"create",input:Object.fromEntries(new FormData(e.target))});if(preview)records=[];preview=false;records.unshift(record);state.currentPart={id:record.part_id};syncListings();dialog.close();openSalvageAssistant();}catch(err){toast(err.message);}finally{b.disabled=false;}};}
  dialog.showModal();
}
async function loadInventory() {
  const notice = $("inventoryNotice");
  notice.textContent = "Loading inventory…";
  user = null; setupError = "";
  $("marketUser").textContent = "Guest";
  $("marketAuth").textContent = "Sign in";
  $("marketAuth").href = "/login";
  $("marketAuth").onclick = null;
  try {
    let data;
    try { data = await api("/api/platform"); }
    catch (err) { if (![401, 503].includes(err.status)) throw err; }
    user = data?.user || null;
    const catalog = (await api("/api/catalog")).records;
    const saved = new Map((data?.records || []).map(r => [r.part_id, r]));
    records = catalog.map(source => {
      const record = saved.get(source.part_id);
      return record ? { ...record, listing: source.listing, thumbnail: source.thumbnail, preview: false } : source;
    });
    // Retain seller-created inventory; old demo catalogs do not replace the supplied feed.
    records.push(...(data?.records || []).filter(r => !/^(MIR|AIR|SALVAGE)-/i.test(r.part_id) && !r.ledger.demo));
    setupError = data?.error || "";
    preview = records.some(r => r.preview);
    if (user) {
      $("marketUser").textContent = user.email;
      $("marketAuth").textContent = "Sign out";
      $("marketAuth").href = "/auth/signout";
      $("marketAuth").onclick = async e => {
        e.preventDefault();
        try { await api("/auth/signout", {}); window.location.assign("/"); }
        catch (err) { toast(err.message); }
      };
    }
    notice.innerHTML = !user
      ? '<span>Browse all inventory as a guest. Sign in to save changes, prepare drafts or send messages.</span><a class="location-btn" href="/login">Sign in or create an account</a>'
      : setupError ? `<span>${esc(setupError)}</span>`
      : preview ? '<span>Browse the supplied catalog. Import listings to save corrections and drafts to your account.</span><button id="importExisting">Import listings</button>'
      : `<span>${records.length} saved parts · evidence, drafts and readiness from your account</span>`;
    if ($("importExisting")) $("importExisting").onclick = async e => {
      e.target.disabled = true;
      try { const result = await api("/api/platform", { action: "seed" }); toast(`Imported ${result.created} existing parts. Existing saved records were preserved.`); await loadInventory(); }
      catch (err) { toast(err.message); e.target.disabled = false; }
    };
    syncListings();
    const requested = new URLSearchParams(location.search).get("part");
    if (requested) {
      const selected = LISTINGS.find(r => r.id === requested.toUpperCase() || r.listingId === requested);
      if (selected) { state.currentPart = selected; openSalvageAssistant(); }
      else toast("That part is not in your inventory.");
    }
  } catch (err) {
    notice.innerHTML = `<span>${esc(err.message)}</span><button id="retryInventory">Try again</button>`;
    $("retryInventory").onclick = loadInventory;
    $("listingsContainer").innerHTML = '<p>Inventory is temporarily unavailable.</p>';
  }
}
function bootMarketplace() {
  if (!$("listingsContainer") || $("listingsContainer").dataset.booted) return;
  $("listingsContainer").dataset.booted="true";
  const notice=document.createElement("div");notice.id="inventoryNotice";notice.className="inventory-notice";notice.setAttribute("role","status");$("listingsContainer").before(notice);
  bindThemeToggle();bindFeedControls();bindRadialMenu();bindChatDrawer();
  document.querySelector(".btn-sell").onclick=openIntake;
  $("mainFeedHeading").textContent="Salvage Inventory · Listing Workspace";
  $("mainFeedSubHeading").textContent="Existing yard records · source evidence · UAE → UK internal review";
  document.querySelector('.chip[data-category="ready"]').lastChild.textContent=" Ready for Seller Review";
  document.querySelector(".corridor-banner-title-row").innerHTML="<h4>UAE → UK · Parts ready for seller review</h4>";
  document.querySelector(".corridor-banner-text p").textContent="Filtered by the internal readiness checklist. Seller approval and shipping arrangements still require review.";
  $("floatingChatPill").querySelector("span").textContent="Conversations";
  $("brandLogoBox").onkeydown=e=>{if(e.key==="Enter" || e.key===" "){e.preventDefault();resetToLandingPage();}};
  $("btnAnalogueTrigger").setAttribute("aria-expanded","false");
  $("analogueMenuBackdrop").setAttribute("aria-hidden","true");
  $("salvageAssistantModal").setAttribute("role","dialog");$("salvageAssistantModal").setAttribute("aria-modal","true");$("salvageAssistantModal").setAttribute("aria-labelledby","assistantMainHeading");
  $("salvageAssistantModal").onclick=e=>{if(e.target===$("salvageAssistantModal"))closeSalvageAssistant();};
  document.addEventListener("keydown",e=>{
    if(e.key==="Escape"){closeAnalogueMenu();closeSalvageAssistant();closeChatDrawer();}
    if(e.key==="Tab"){
      const modal=$("salvageAssistantModal").classList.contains("open") ? $("salvageAssistantModal") : RADIAL.open ? $("analogueMenuPanel") : null;
      if(!modal)return;
      const items=[...modal.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea,select,a[href]')].filter(el=>el.getClientRects().length);
      const first=items[0],last=items.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    }
  });
  loadInventory();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",bootMarketplace,{once:true});else bootMarketplace();
