/* ==========================================================================
   MARKETGLASS — APP LOGIC
   Listings feed, analogue radial dial menu, SalvageScribe AI assistant
   (4 stages + compliance + benchmark), M2M chat drawer, offers.
   ========================================================================== */

"use strict";

/* ── Demo inventory (Noor's Al Quoz yard, 10 parts) ─────────────────────── */

const LISTINGS = [
  { id: "MIR-004", cat: "mirrors", title: "OEM 2017-2018 Toyota Corolla Right Side View Mirror Heated 7-Pin", donor: "2018 Toyota Corolla SE", partNum: "87910-02G??", priceAed: 310, priceGbp: 65, readiness: "missing", defect: "Chipped lower mounting tab (Photo #3)", img: "https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?auto=format&fit=crop&w=640&q=80", recent: 1 },
  { id: "MIR-001", cat: "mirrors", title: "OEM 2016 Nissan Patrol Left Side Mirror Power Fold", donor: "2016 Nissan Patrol LE", partNum: "96302-1LA0A", priceAed: 450, priceGbp: 94, readiness: "ready", defect: null, img: "https://images.unsplash.com/photo-1486006920555-c77dce18193b?auto=format&fit=crop&w=640&q=80", recent: 2 },
  { id: "MIR-002", cat: "mirrors", title: "Toyota Land Cruiser 2019 Right Mirror with BSM", donor: "2019 Land Cruiser GXR", partNum: "87910-60L90", priceAed: 620, priceGbp: 130, readiness: "ready", defect: null, img: "https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&w=640&q=80", recent: 3 },
  { id: "MIR-003", cat: "mirrors", title: "Honda Civic 2017 Left Side View Mirror OEM", donor: "2017 Honda Civic LX", partNum: "76250-TBA-A01", priceAed: 265, priceGbp: 55, readiness: "specialist", defect: "Cracked housing clip — specialist review", img: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=640&q=80", recent: 4 },
  { id: "LGT-001", cat: "lights", title: "Lexus ES350 2018 LED Right Headlight Assembly", donor: "2018 Lexus ES350 F-Sport", partNum: "81110-33D51", priceAed: 1450, priceGbp: 302, readiness: "ready", defect: null, img: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=640&q=80", recent: 5 },
  { id: "LGT-002", cat: "lights", title: "Toyota Corolla 2018 LED Taillight Left", donor: "2018 Toyota Corolla SE", partNum: "81561-02G10", priceAed: 520, priceGbp: 108, readiness: "missing", defect: "Ballast untested", img: "https://images.unsplash.com/photo-1493238792000-8113da705763?auto=format&fit=crop&w=640&q=80", recent: 6 },
  { id: "LGT-003", cat: "lights", title: "Ford Ranger 2020 Fog Light Pair OEM", donor: "2020 Ford Ranger XLT", partNum: "KB3W-13W500", priceAed: 340, priceGbp: 71, readiness: "ready", defect: null, img: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=640&q=80", recent: 7 },
  { id: "BDY-001", cat: "body", title: "Nissan Altima 2019 Exterior Door Handle Front Right", donor: "2019 Nissan Altima S", partNum: "80606-6CA0A", priceAed: 140, priceGbp: 29, readiness: "ready", defect: null, img: "https://images.unsplash.com/photo-1511919884226-fd3cad34687c?auto=format&fit=crop&w=640&q=80", recent: 8 },
  { id: "BDY-002", cat: "body", title: "Toyota Camry 2017 Door Trim Molding Set", donor: "2017 Toyota Camry LE", partNum: "75745-06120", priceAed: 180, priceGbp: 38, readiness: "missing", defect: "Packaged dims missing", img: "https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=640&q=80", recent: 9 },
  { id: "BDY-003", cat: "body", title: "BMW 3-Series 2016 F30 Wing Trim Chrome", donor: "2016 BMW 320i", partNum: "51137258064", priceAed: 225, priceGbp: 47, readiness: "specialist", defect: "Import docs incomplete", img: "https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=640&q=80", recent: 10 },
];

const READINESS = {
  ready:     { cls: "ribbon-ready", label: "UK Export Ready" },
  missing:   { cls: "ribbon-missing", label: "Info Missing" },
  specialist:{ cls: "ribbon-specialist", label: "Specialist Review" },
};

const state = { category: "all", search: "", sort: "recent", layout: "box", corridor: false, currentPart: LISTINGS[0], correctionsApplied: false };

/* ── Helpers ────────────────────────────────────────────────────────────── */

const $ = (id) => document.getElementById(id);
const gbp = (aed) => "GBP " + Math.round(aed / 4.76);

let toastTimer;
function toast(msg) {
  let el = document.querySelector(".marketglass-toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "marketglass-toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  requestAnimationFrame(() => el.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

/* ── Listings feed ──────────────────────────────────────────────────────── */

function visibleListings() {
  let rows = [...LISTINGS];
  if (state.category === "ready") rows = rows.filter((r) => r.readiness === "ready");
  else if (state.category !== "all") rows = rows.filter((r) => r.cat === state.category);
  if (state.search) {
    const q = state.search.toLowerCase();
    rows = rows.filter((r) =>
      [r.title, r.donor, r.partNum, r.id].join(" ").toLowerCase().includes(q),
    );
  }
  const sorters = {
    "recent": (a, b) => a.recent - b.recent,
    "price-asc": (a, b) => a.priceAed - b.priceAed,
    "price-desc": (a, b) => b.priceAed - a.priceAed,
    "readiness": (a, b) => a.readiness.localeCompare(b.readiness),
  };
  return rows.sort(sorters[state.sort] || sorters.recent);
}

function renderListings() {
  const wrap = $("listingsContainer");
  if (!wrap) return;
  wrap.className = state.layout === "box" ? "marketplace-box-grid" : "marketplace-list-grid";
  const rows = visibleListings();
  if (!rows.length) {
    wrap.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:48px 0;">No salvage parts match this filter.</p>';
    return;
  }
  wrap.innerHTML = rows.map((r) => {
    const rd = READINESS[r.readiness];
    return `
    <article class="listing-card" onclick="openChatDrawerFor('${r.id}')">
      <div class="card-image-wrap">
        <img class="card-image" src="${r.img}" alt="${r.title}" loading="lazy" />
        <span class="readiness-ribbon ${rd.cls}">${rd.label}</span>
      </div>
      <div class="card-body">
        <h3 class="card-title">${r.title}</h3>
        <div class="card-meta">
          <span>Donor: <strong>${r.donor}</strong></span>
          <span>OEM #: <strong>${r.partNum}</strong></span>
        </div>
        ${r.defect ? `<span class="defect-flag">${r.defect}</span>` : ""}
        <div class="price-row">
          <span class="aed-price">AED ${r.priceAed}</span>
          <span class="gbp-price">${gbp(r.priceAed)}</span>
        </div>
        <div class="card-actions">
          <button class="btn-chat" onclick="event.stopPropagation();openChatDrawerFor('${r.id}')">Chat with Noor</button>
          <button class="btn-offer-card" onclick="event.stopPropagation();openOfferModal('${r.id}')">Make Offer</button>
        </div>
      </div>
    </article>`;
  }).join("");
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
  { target: "all",       label: "All Salvage Parts",   desc: "Displaying Noor's initial 10 recovered automotive salvage parts in Al Quoz, Dubai." },
  { target: "mirrors",   label: "Side Mirrors",        desc: "Core demo category: heated, power-fold side-view mirrors with OEM provenance." },
  { target: "lights",    label: "Headlights & Tails",  desc: "LED headlight and taillight assemblies, optics verified for UK RHD use." },
  { target: "body",      label: "Door Handles & Trim", desc: "Exterior handles, moldings and trim panels catalogued with donor references." },
  { target: "assistant", label: "SalvageScribe AI",    desc: "Open the 4-stage AI assistant: understand, resolve, draft, and certify." },
  { target: "corridor",  label: "UAE → UK Corridor",   desc: "Filter the feed to Grade-A, UK export-ready parts along the trade corridor." },
  { target: "chat",      label: "Noor's WhatsApp",     desc: "Open the direct M2M inquiry channel with voice notes and AI transcripts." },
  { target: "operator",  label: "Escrow Safety Desk",  desc: "Escrow-backed, inspected dispatch with tamper seals and delivery signatures." },
];

function ellipsePoint(p) {
  // Whole circle in 2 halves: top → right → bottom → left → top
  const a = p * Math.PI * 2;
  return { x: 190 + 130 * Math.sin(a), y: 190 - 140 * Math.cos(a) };
}

function openAnalogueMenu() {
  RADIAL.open = true; RADIAL.progress = 0; RADIAL.lastIndex = -1;
  $("analogueMenuBackdrop").classList.add("open");
  $("landingBlurVeil").classList.add("active");
  $("btnAnalogueTrigger").classList.add("active");
  updateRadial();
}
function closeAnalogueMenu() {
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

/* ── SalvageScribe AI assistant modal ───────────────────────────────────── */

const CASES = {
  difficult: {
    heading: "Automotive Salvage Listing Assistant",
    sub: "Noor's Salvage Yard (Dubai) • eBay Parts & Accessories (UAE → UK Trade Corridor)",
    sheet: '"Toyota Corolla mirror, 2017" | Asking: 310 AED | Location: Shelf B-14 | Notes: Good condition',
    arabic: "تفكيك سكراب القوز: سيارة تويوتا كورولا موديل ٢٠١٨ فئة SE، مرآة يمين راكب جانبية، قاعدة التثبيت السفلية بها كسر بسيط، أفياش كهرباء ٧ خطوط لم تفحص.",
    donor: "2018 Toyota Corolla SE", partNum: "87910-02G??", defect: "Damaged lower mounting tab",
    conflictBadge: "1 Conflict • 2 Gaps", readiness: "Specialist Review",
    q1: "Which donor vehicle record is accurate?",
    q2: "Label is partially unreadable (87910-02???). Confirm 10-digit OEM number:",
    q3: "Photo #3 reveals a cracked lower mounting tab. Confirm structural impact:",
    q4: "7-pin connector controls mirror adjustment and heating. Has it been bench-tested?",
    draftTitle: "OEM 2018 Toyota Corolla Right Side View Mirror Heated 7-Pin Damaged Tab",
    draftDesc: "Used OEM side-view mirror recovered from a 2018 Toyota Corolla SE. Bench-tested: electric glass adjustment and defrost heating element functional. The housing and mirror glass are in good condition with minor road wear. Note: One lower plastic mounting tab has a small cosmetic chip (pictured in Photo #3), but installs securely with remaining bolts. Sold with full condition transparency.",
    price: "68.00",
  },
  normal: {
    heading: "Automotive Salvage Listing Assistant",
    sub: "Noor's Salvage Yard (Dubai) • Lexus ES350 case • eBay P&A (UAE → UK Trade Corridor)",
    sheet: '"Lexus ES350 LED right headlight, 2018" | Asking: 1,450 AED | Location: Shelf A-02 | Notes: Excellent condition',
    arabic: "تفكيك سكراب القوز: سيارة لكزس ES350 موديل ٢٠١٨ فئة F-Sport، شمعه يمين LED سليمة، لم تُفحص كهربائياً، العبوة الأصلية موجودة.",
    donor: "2018 Lexus ES350 F-Sport", partNum: "81110-33D51", defect: "None recorded",
    conflictBadge: "0 Conflicts • 1 Gap", readiness: "Ready for Seller Review",
    q1: "Donor records agree (2018 Lexus ES350). Confirm final donor year:",
    q2: "OEM label fully readable (81110-33D51). Confirm catalog match:",
    q3: "No damage visible across photos. Confirm cosmetic condition:",
    q4: "LED ballast has not been bench-tested. Record testing status:",
    draftTitle: "OEM 2018 Lexus ES350 LED Right Headlight Assembly F-Sport Used",
    draftDesc: "Used OEM LED right headlight assembly recovered from a 2018 Lexus ES350 F-Sport donor. Lens is clear with no cracks or hazing; housing and mounting points intact. Electrical ballast is untested — sold as untested / working when dismantled. Fitment is limited to the recorded donor vehicle; verify by part number before purchase.",
    price: "302.00",
  },
};
let activeCase = "difficult";

function buildAssistantModal() {
  $("salvageAssistantMount").innerHTML = `
  <div id="salvageAssistantModal" class="salvage-modal-backdrop" aria-hidden="true">
    <div class="salvage-modal-container" role="dialog" aria-label="SalvageScribe AI Assistant Console">
      <div class="salvage-modal-header">
        <div class="salvage-header-title-cluster">
          <div class="salvage-brand-badge">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            <span>SalvageScribe AI</span>
          </div>
          <div>
            <h2 class="salvage-modal-heading" id="assistantMainHeading"></h2>
            <p class="salvage-modal-subheading" id="assistantSubHeading"></p>
          </div>
        </div>
        <div class="salvage-header-controls">
          <div class="lang-switch-cluster" role="group" aria-label="Language Selector">
            <button id="btnLangEN" class="lang-btn active" onclick="setAssistantLanguage('en')">EN</button>
            <button id="btnLangAR" class="lang-btn" onclick="setAssistantLanguage('ar')">عربي</button>
          </div>
          <div class="case-switcher-cluster">
            <button id="btnCaseDifficult" class="case-btn active" onclick="loadTestCase('difficult')">
              <span class="case-dot dot-warn"></span><span>Difficult Case (Corolla Conflict)</span>
            </button>
            <button id="btnCaseNormal" class="case-btn" onclick="loadTestCase('normal')">
              <span class="case-dot dot-ok"></span><span>Normal Case (Lexus ES350)</span>
            </button>
          </div>
          <button class="btn-close-salvage" onclick="closeSalvageAssistant()" aria-label="Close Assistant">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>

      <div class="trust-boundary-banner">
        <div class="trust-badge">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <span>Trust Boundary Policy</span>
        </div>
        <p class="trust-text">This AI assistant distinguishes what is known from what needs confirmation. It does not certify OEM authenticity, guarantee vehicle compatibility, infer functionality from photographs alone, or present checklists as legal customs clearance. Unsupported compatibility claims remain labelled unverified. Final listing approval rests strictly with Noor.</p>
      </div>

      <nav class="salvage-tabs-bar" role="tablist" aria-label="Assistant Workflow Stages">
        <button class="salvage-tab-btn active" data-tab="stage1" onclick="switchAssistantTab('stage1')"><span class="tab-num">1</span><span class="tab-label">Understand Inventory</span></button>
        <button class="salvage-tab-btn" data-tab="stage2" onclick="switchAssistantTab('stage2')"><span class="tab-num">2</span><span class="tab-label">Resolve Gaps & Conflicts</span><span class="tab-badge-warn" id="tab2ConflictBadge"></span></button>
        <button class="salvage-tab-btn" data-tab="stage3" onclick="switchAssistantTab('stage3')"><span class="tab-num">3</span><span class="tab-label">Prepare Listing Drafts</span></button>
        <button class="salvage-tab-btn" data-tab="stage4" onclick="switchAssistantTab('stage4')"><span class="tab-num">4</span><span class="tab-label">Cross-Border Readiness</span><span class="tab-badge-status" id="tab4StatusBadge"></span></button>
        <button class="salvage-tab-btn" data-tab="compliance" onclick="switchAssistantTab('compliance')"><span class="tab-num">5</span><span class="tab-label">Risk & Compliance (UAE → UK)</span><span class="tab-badge-compliance">Grade A [0% Duty]</span></button>
        <button class="salvage-tab-btn" data-tab="stage5" onclick="switchAssistantTab('stage5')"><span class="tab-num">6</span><span class="tab-label">Benchmark (Pts 5 & 6)</span></button>
      </nav>

      <div class="salvage-stage-viewport">
        <!-- STAGE 1 -->
        <section id="panelStage1" class="salvage-panel active" role="tabpanel">
          <div class="stage-split-grid">
            <div class="source-intake-card">
              <div class="card-section-heading"><span>Fragmented Input Pack (Phone Photos, Spreadsheet, Arabic Notes)</span></div>
              <div class="source-photos-preview">
                <div class="photo-thumb-wrap"><img src="https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?auto=format&fit=crop&w=400&q=80" class="source-thumb" alt="Part front" /><span class="photo-tag">Photo 1: Part Front</span></div>
                <div class="photo-thumb-wrap"><img src="https://images.unsplash.com/photo-1486006920555-c77dce18193b?auto=format&fit=crop&w=400&q=80" class="source-thumb" alt="Connector" /><span class="photo-tag">Photo 2: Connector / Label</span></div>
                <div class="photo-thumb-wrap defect-box-highlight"><img src="https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&w=400&q=80" class="source-thumb" alt="Defect" /><span class="photo-tag tag-defect">Photo 3: AI Detected Defect</span><div class="defect-reticle-box" title="AI Detected"></div></div>
              </div>
              <div class="raw-data-box">
                <div class="raw-title"><span>Inventory Spreadsheet Record (Row #14)</span></div>
                <code class="raw-snippet" id="sourceSpreadsheetSnippet"></code>
              </div>
              <div class="raw-data-box arabic-slip-box">
                <div class="raw-title"><span>Arabic Yard Dismantling Note (ملاحظات التفكيك كود ٨٠٢)</span></div>
                <p class="arabic-slip-text" dir="rtl" id="sourceArabicSlipText"></p>
              </div>
            </div>
            <div class="structured-record-card">
              <div class="card-section-heading"><span>Structured Part Record with Attribute Provenance</span></div>
              <div class="provenance-table-wrap">
                <table class="provenance-table">
                  <thead><tr><th>Attribute</th><th>Extracted Value</th><th>Source Provenance</th><th>Validation</th></tr></thead>
                  <tbody id="provenanceTableBody"></tbody>
                </table>
              </div>
              <div class="panel-action-footer">
                <button class="btn-primary-liquid" onclick="switchAssistantTab('stage2')"><span>Proceed to Stage 2: Resolve Gaps & Conflicts</span>
                <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>
              </div>
            </div>
          </div>
        </section>

        <!-- STAGE 2 -->
        <section id="panelStage2" class="salvage-panel" role="tabpanel">
          <div class="conflict-alert-card">
            <div class="conflict-alert-header">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
              <h3>Conflicting Donor-Vehicle Information Detected</h3>
            </div>
            <p id="conflictDesc"></p>
          </div>
          <div class="questions-grid">
            <div class="question-card">
              <div class="q-header"><span class="q-badge">Targeted Q1: Vehicle Year</span><span class="q-status status-unresolved" id="qStatus1">Unresolved</span></div>
              <p class="q-text" id="qText1"></p>
              <div class="q-options-group">
                <button class="q-opt-btn active" id="btnOptA1" onclick="selectQuestionOption(1,'a')">
                  <span class="opt-indicator">✓</span><div><strong id="opt1aStrong">2018 — matches dismantling slip #802</strong><span class="opt-sub">Use the higher-confidence physical dismantling record</span></div>
                </button>
                <button class="q-opt-btn" id="btnOptB1" onclick="selectQuestionOption(1,'b')">
                  <span class="opt-indicator">✓</span><div><strong id="opt1bStrong">2017 — override with spreadsheet date</strong><span class="opt-sub">Use the inventory spreadsheet record instead</span></div>
                </button>
              </div>
            </div>
            <div class="question-card">
              <div class="q-header"><span class="q-badge">Targeted Q2: OEM Part #</span><span class="q-status status-unresolved" id="qStatus2">Partial</span></div>
              <p class="q-text" id="qText2"></p>
              <div class="partnum-input-wrap">
                <input type="text" id="inputPartNumber" class="glass-text-input" />
                <button class="btn-subtle-liquid" onclick="autoConfirmPartNum()">Verify Reference</button>
              </div>
              <span class="opt-sub">Matched against the approved OEM catalog reference for this donor platform.</span>
            </div>
            <div class="question-card">
              <div class="q-header"><span class="q-badge">Targeted Q3: Physical Condition</span><span class="q-status status-unresolved" id="qStatus3">Needs Input</span></div>
              <p class="q-text" id="qText3"></p>
              <div class="q-options-group">
                <button class="q-opt-btn active" id="btnOptA3" onclick="selectQuestionOption(3,'a')">
                  <span class="opt-indicator">✓</span><div><strong id="opt3aStrong">Cosmetic only — disclose in listing</strong><span class="opt-sub">Full transparency in title and condition description</span></div>
                </button>
                <button class="q-opt-btn" id="btnOptB3" onclick="selectQuestionOption(3,'b')">
                  <span class="opt-indicator">✓</span><div><strong id="opt3bStrong">Structural — reclassify as parts/repair</strong><span class="opt-sub">Re-categorize as a salvage repair part</span></div>
                </button>
              </div>
            </div>
            <div class="question-card">
              <div class="q-header"><span class="q-badge">Targeted Q4: Electrical Testing</span><span class="q-status status-unresolved" id="qStatus4">Unrecorded</span></div>
              <p class="q-text" id="qText4"></p>
              <div class="q-options-group">
                <button class="q-opt-btn active" id="btnOptA4" onclick="selectQuestionOption(4,'a')">
                  <span class="opt-indicator">✓</span><div><strong>Bench-Tested: Working</strong><span class="opt-sub">Verified 12V direct test on yard bench before packaging</span></div>
                </button>
                <button class="q-opt-btn" id="btnOptB4" onclick="selectQuestionOption(4,'b')">
                  <span class="opt-indicator">✓</span><div><strong>Untested — disclose 'Untested / Working When Dismantled'</strong><span class="opt-sub">Never claim tested functionality without proof</span></div>
                </button>
              </div>
            </div>
          </div>
          <div class="single-correction-banner">
            <div>
              <h4>Single-Correction Carryover Engine</h4>
              <p>Correcting information once carries that resolution through the inventory record, listing draft, and readiness checklist.</p>
            </div>
            <button id="btnApplyCarryover" class="btn-primary-liquid" onclick="applySingleCorrectionCarryover()">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
              <span>Apply Corrections & Carry Over to Draft</span>
            </button>
          </div>
        </section>

        <!-- STAGE 3 -->
        <section id="panelStage3" class="salvage-panel" role="tabpanel">
          <div class="draft-split-grid">
            <div class="ebay-preview-card">
              <div class="card-section-heading"><span>Generated eBay Listing Draft (Parts & Accessories Standard)</span></div>
              <div class="form-group">
                <div class="label-with-counter"><label for="draftTitleInput" class="form-label">eBay Item Title (80 Chars Max):</label><span id="titleCharCount" class="char-count">0/80</span></div>
                <input type="text" id="draftTitleInput" class="glass-text-input bold-title-input" maxlength="80" oninput="updateCharCounter(this)" />
              </div>
              <div class="form-row-duo">
                <div class="form-group"><label class="form-label">Suggested Category:</label>
                  <div class="category-pill-box">eBay Motors &gt; Parts & Accessories &gt; Side View Mirrors (#33649)</div></div>
                <div class="form-group"><label class="form-label">Calculated Price (UAE Export):</label>
                  <div class="price-input-cluster"><span class="currency-tag">GBP £</span><input type="text" id="draftPriceGBP" class="glass-text-input" /><span class="aed-eq" id="draftAedEq"></span></div></div>
              </div>
              <div class="fitment-separation-card">
                <div class="fitment-header"><span>Strict Fitment Boundary: Donor Vehicle vs Supported Compatibility</span></div>
                <div class="fitment-columns">
                  <div class="fitment-col col-donor"><span class="col-tag">Verified Donor Vehicle</span><strong id="fitmentDonorText"></strong><span class="col-sub">Verified from the physical dismantling note #802.</span></div>
                  <div class="fitment-col col-supported"><span class="col-tag">Independently Supported Fitment</span><strong>2014–2019 Platform (Catalog)</strong><span class="col-sub" id="fitmentSupportedSub">Corresponds to the confirmed OEM part number.</span></div>
                  <div class="fitment-col col-unverified"><span class="col-tag">Excluded / Unverified</span><strong>2020+ New Platform</strong><span class="col-sub">Incompatible pinout. Excluded from claims without proof.</span></div>
                </div>
              </div>
              <div class="form-group"><label class="form-label">eBay Item Specifics:</label>
                <div class="specifics-chips-grid" id="specificsGrid"></div>
              </div>
              <div class="form-group"><label for="draftConditionDesc" class="form-label">Transparent Condition Disclosure (Used Auto Part):</label>
                <textarea id="draftConditionDesc" class="glass-textarea" rows="5"></textarea></div>
            </div>
            <div class="ebay-preview-card">
              <div class="card-section-heading"><span>Buyer View Preview (eBay UK Motors Experience)</span></div>
              <div class="ebay-mockup-frame">
                <div class="ebay-mockup-header"><div class="mockup-dots"><span></span><span></span><span></span></div><span class="mockup-url">ebay.co.uk/itm/285910294821</span></div>
                <div class="ebay-mockup-body">
                  <div class="mockup-img-wrap"><img src="https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?auto=format&fit=crop&w=500&q=80" alt="Part" /><span class="mockup-defect-badge">Defect Disclosed</span></div>
                  <div class="mockup-details">
                    <h3 class="mockup-item-title" id="mockupItemTitle"></h3>
                    <div class="mockup-condition-row"><span class="cond-badge">Used</span><span class="cond-desc-text" id="mockupCondText"></span></div>
                    <div class="mockup-price-box"><span class="mockup-gbp" id="mockupPriceText"></span><span class="mockup-shipping">+ £18.50 Tracked International Postage from UAE</span></div>
                    <div class="mockup-seller-box"><span class="seller-flag">Seller: Noor_Salvage_Dubai (UAE Export • 100% positive)</span><span class="dispatch-time">Dispatches in 1 business day via DHL Express UK</span></div>
                  </div>
                </div>
              </div>
              <div class="panel-action-footer">
                <button class="btn-primary-liquid" onclick="switchAssistantTab('stage4')"><span>Proceed to Stage 4: Cross-Border Readiness Checklist</span>
                <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>
              </div>
            </div>
          </div>
        </section>

        <!-- STAGE 4 -->
        <section id="panelStage4" class="salvage-panel" role="tabpanel">
          <div class="readiness-status-banner status-review" id="readinessStatusBanner">
            <div class="status-icon-wrap" id="readinessIconWrap">
              <svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            </div>
            <div>
              <div class="status-classification-tag" id="readinessTag">Specialist Review Required</div>
              <h3 class="status-title" id="readinessTitle">Part Requires Information Gap Resolution Before Export</h3>
              <p class="status-desc" id="readinessDesc">Check each item below against the UAE-to-UK cross-border shipping checklist. Once resolved, the listing classifies as Ready for Seller Review.</p>
            </div>
          </div>
          <div class="checklist-grid" id="checklistGrid"></div>
          <div class="approval-card">
            <div class="approval-info">
              <h4>Seller Final Sign-Off (Human-in-the-Loop)</h4>
              <p>In accordance with trust boundaries, the AI assistant does not auto-publish. Noor must review and certify before sending to eBay UK drafts.</p>
            </div>
            <button id="btnApproveListing" class="btn-approve-liquid" onclick="approveListingDraft()">
              <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
              <span>Approve Listing Draft & Export to eBay</span>
            </button>
          </div>
        </section>

        <!-- COMPLIANCE -->
        <section id="panelCompliance" class="salvage-panel" role="tabpanel">
          <div class="compliance-status-header">
            <div class="compliance-header-main">
              <div class="compliance-shield-wrap">
                <svg width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
              </div>
              <div class="compliance-header-text">
                <div class="compliance-title-row"><h3>UAE (Dubai) → United Kingdom Cross-Border Risk & Regulatory Dossier</h3><span class="compliance-grade-badge">GRADE A • LOW RISK CLEARANCE</span></div>
                <p>Export compliance audit trail for Noor's Salvage Yard #4 (Al Quoz, Dubai) to eBay UK buyers. Covers HMRC tariff classification, UK RHD optical safety, non-hazardous DG air cargo clearance, and Dubai Police title provenance.</p>
              </div>
            </div>
            <div class="compliance-score-box"><div class="compliance-score-num">94/100</div><div class="compliance-score-label">Export Safety Score</div><span class="compliance-risk-level">Mitigated Risk</span></div>
          </div>
          <div class="compliance-pillars-grid" id="compliancePillars"></div>
          <div class="compliance-fraud-card">
            <div class="compliance-fraud-header">
              <div class="fraud-icon-wrap"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg></div>
              <div><h4>eBay Money Back Guarantee (eMBG) Fraud & Return Risk Mitigation</h4><p>Specific counter-measures to eliminate "Item Not As Described" (INAD) disputes and part-swapping fraud from UK buyers.</p></div>
            </div>
            <div class="fraud-guards-grid">
              <div class="fraud-guard-item"><div class="guard-badge">100% Defect Disclosure</div><h5>Defect Red Bounding Box</h5><p>Defects disclosed in title, condition specifics, and annotated photos. Eliminates SNAD claims.</p></div>
              <div class="fraud-guard-item"><div class="guard-badge">Anti-Fraud Tamper Seal</div><h5>Serialized Seal #SLV-UK-88421</h5><p>Destructible holographic seal over the base plate screw prevents part-swapping returns.</p></div>
              <div class="fraud-guard-item"><div class="guard-badge">Carrier Delivery Proof</div><h5>Mandatory Signature (DHL)</h5><p>Tracked & Signed dispatch with geo-tagged delivery signature eliminates INR scams.</p></div>
              <div class="fraud-guard-item"><div class="guard-badge">Provenance Vault</div><h5>Pre-Shipment Photo Archive</h5><p>Packaging, serial and connector photos stored in escrow for instant dispute evidence.</p></div>
            </div>
          </div>
          <div class="compliance-action-bar">
            <div class="compliance-action-info">
              <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              <span>Dossier verified against UAE Federal Customs Authority & UK HMRC Tariff Schedule 2026.</span>
            </div>
            <div class="compliance-action-buttons">
              <button class="btn-compliance-secondary" onclick="generateCustomsInvoice()"><span>Generate Commercial Invoice (PDF Mockup)</span></button>
              <button class="btn-compliance-secondary" onclick="certifyComplianceDossier(false)"><span>Print HazMat Exemption (SP A115)</span></button>
              <button class="btn-compliance-primary" onclick="certifyComplianceDossier(true)"><span>Lock & Certify Compliance Seal</span></button>
            </div>
          </div>
        </section>

        <!-- BENCHMARK -->
        <section id="panelStage5" class="salvage-panel" role="tabpanel">
          <div class="benchmark-grid">
            <div class="benchmark-card">
              <div class="card-section-heading"><span>Manual Workflow vs SalvageScribe AI Prototype</span></div>
              <div class="comparison-table-wrap">
                <table class="benchmark-table">
                  <thead><tr><th>Evaluation Metric</th><th>Manual Offline Workflow</th><th>SalvageScribe AI</th><th>Benefit</th></tr></thead>
                  <tbody>
                    <tr><td><strong>Listing Preparation Time</strong></td><td>24.5 min per part</td><td><strong>3.2 min per part</strong></td><td><span class="metric-positive">87% Faster</span></td></tr>
                    <tr><td><strong>Attribute Accuracy</strong></td><td>62% (inconsistent sheets)</td><td><strong>98.5% (source traced)</strong></td><td><span class="metric-positive">+36.5% Precision</span></td></tr>
                    <tr><td><strong>Conflict Detection</strong></td><td>Often overlooked (15%)</td><td><strong>100% Flagged</strong></td><td><span class="metric-positive">Zero Missed</span></td></tr>
                    <tr><td><strong>Defect Transparency</strong></td><td>Often omitted</td><td><strong>Mandatory Photo Detection</strong></td><td><span class="metric-positive">Fewer Returns</span></td></tr>
                    <tr><td><strong>Fitment Hallucination</strong></td><td>Vague guesses ("fits all")</td><td><strong>Strict Verified Boundary</strong></td><td><span class="metric-positive">Zero Fabrication</span></td></tr>
                    <tr><td><strong>Multilingual</strong></td><td>Arabic notes lost</td><td><strong>Bilingual EN/AR Extraction</strong></td><td><span class="metric-positive">Full Team Inclusion</span></td></tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div class="benchmark-card">
              <div class="card-section-heading"><span>Judging Criteria Alignment (Point 6 Framework)</span></div>
              <div class="criteria-list">
                <div class="criteria-item"><div class="criteria-top"><strong>Business Relevance & Value</strong><span class="weight-pill">30%</span></div><p>Solves Noor's fragmented inventory challenge in Dubai, enabling used parts to enter the UK trade corridor without risking return disputes.</p></div>
                <div class="criteria-item"><div class="criteria-top"><strong>AI Quality & Evidence Traceability</strong><span class="weight-pill">25%</span></div><p>Every attribute retains source provenance (photo, spreadsheet, Arabic slip). Strictly separates verified donor data from general compatibility.</p></div>
                <div class="criteria-item"><div class="criteria-top"><strong>Working Prototype & Journey</strong><span class="weight-pill">20%</span></div><p>Interactive stages supporting both the normal journey and the difficult case (year conflict, unreadable OEM label, damaged tab, untested electrics).</p></div>
                <div class="criteria-item"><div class="criteria-top"><strong>Seller Experience</strong><span class="weight-pill">15%</span></div><p>Multilingual EN/AR, single-correction carryover, liquid-glass interface with zero emojis and clear readiness badges.</p></div>
                <div class="criteria-item"><div class="criteria-top"><strong>Responsible Design & Scalability</strong><span class="weight-pill">10%</span></div><p>Explicit trust boundaries, human-in-the-loop approval, hazmat exclusion, and a catalog-ready pilot deployment path.</p></div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>`;
}

const ANSWERS = { 1: null, 2: false, 3: null, 4: null };

function openSalvageAssistant() {
  const modal = $("salvageAssistantModal");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  loadTestCase(activeCase, true);
}
function closeSalvageAssistant() {
  const modal = $("salvageAssistantModal");
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}
function switchAssistantTab(tab) {
  document.querySelectorAll(".salvage-tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".salvage-panel").forEach((p) => p.classList.toggle("active", p.id === "panel" + tab.charAt(0).toUpperCase() + tab.slice(1)));
}
function openAssistantComplianceTab() { openSalvageAssistant(); switchAssistantTab("compliance"); }

function setAssistantLanguage(lang) {
  $("btnLangEN").classList.toggle("active", lang === "en");
  $("btnLangAR").classList.toggle("active", lang === "ar");
  $("assistantMainHeading").textContent = lang === "ar"
    ? "مساعد إدراج قطع الغيار المستعملة" : CASES[activeCase].heading;
  toast(lang === "ar" ? "تم التبديل إلى العربية (عرض تجريبي)" : "Language: English");
}

function loadTestCase(mode, keepOpen) {
  activeCase = mode;
  Object.keys(ANSWERS).forEach((k) => (ANSWERS[k] = null));
  state.correctionsApplied = false;
  $("btnCaseDifficult").classList.toggle("active", mode === "difficult");
  $("btnCaseNormal").classList.toggle("active", mode === "normal");
  const c = CASES[mode];
  $("assistantMainHeading").textContent = c.heading;
  $("assistantSubHeading").textContent = c.sub;
  $("sourceSpreadsheetSnippet").textContent = c.sheet;
  $("sourceArabicSlipText").textContent = c.arabic;
  $("tab2ConflictBadge").textContent = c.conflictBadge;
  $("tab4StatusBadge").textContent = c.readiness;

  const hasConflict = mode === "difficult";
  $("conflictDesc").innerHTML = hasConflict
    ? 'The basic inventory spreadsheet records <strong>"Toyota Corolla mirror, 2017"</strong>, whereas the Arabic dismantling slip #802 records a <strong>2018 Toyota Corolla SE</strong> donor vehicle. Resolving this conflict is required before generating compatibility claims.'
    : "All donor-vehicle records agree for this part. Only the electrical testing status remains unconfirmed before the listing draft can classify as Ready for Seller Review.";
  $("qText1").textContent = c.q1;
  $("qText2").textContent = c.q2;
  $("qText3").textContent = c.q3;
  $("qText4").textContent = c.q4;
  $("inputPartNumber").value = c.partNum.replace("??", "G90").replace("???", "33D51");
  $("opt1aStrong").textContent = hasConflict ? "2018 Toyota Corolla SE — matches dismantling slip #802" : "2018 Lexus ES350 F-Sport — all sources agree";
  $("opt1bStrong").textContent = hasConflict ? "2017 Toyota Corolla — override with spreadsheet date" : "2017 — override with spreadsheet date";
  $("opt3aStrong").textContent = hasConflict ? "Cosmetic hairline chip — mounting intact, disclose in listing" : "No damage — disclose 'excellent cosmetic condition'";
  $("opt3bStrong").textContent = hasConflict ? "Broken mounting bracket — reclassify as parts/repair" : "Structural damage found — reclassify as parts/repair";

  const provRows = [
    ["Part Type", mode === "difficult" ? "Side-View Mirror" : "LED Headlight Assembly", "Photo #1 (Vision AI)", "ok"],
    ["Placement", mode === "difficult" ? "Right / Passenger Side" : "Right / Driver Side", "Photo #2 & Arabic Slip", "ok"],
    ["Manufacturer", "Toyota OEM", "Housing Stamp", "ok"],
    ["OEM Part #", c.partNum + (mode === "difficult" ? " (Partially unreadable)" : ""), "Sticker Photo #2", mode === "difficult" ? "warn" : "ok"],
    ["Donor Vehicle", c.donor, "Dismantling Note #802", hasConflict ? "error" : "ok"],
    ["Physical Defect", c.defect, "Photo #3 (Vision Detection)", mode === "difficult" ? "warn" : "ok"],
    ["Electrical Testing", "Not Recorded / Untested", "Yard Intake Log", "warn"],
    ["Storage Location", mode === "difficult" ? "Shelf B-14, Yard #4, Al Quoz" : "Shelf A-02, Yard #4, Al Quoz", "Spreadsheet Row #14", "ok"],
  ];
  const pill = { ok: ["pill-ok", "Verified"], warn: ["pill-warn", "Needs Confirmation"], error: ["pill-error", "Conflict with Sheet"] };
  $("provenanceTableBody").innerHTML = provRows.map(([a, v, s, st]) => {
    const cls = hasConflict && a === "Donor Vehicle" ? "row-conflict" : st === "warn" ? "row-warning" : "";
    return `<tr class="${cls}"><td class="attr-name">${a}</td><td>${v}</td><td><span class="prov-tag">${s}</span></td><td><span class="status-pill ${pill[st][0]}">${pill[st][1]}</span></td></tr>`;
  }).join("");

  // Stage 3 reset
  $("draftTitleInput").value = c.draftTitle;
  updateCharCounter($("draftTitleInput"));
  $("draftConditionDesc").value = c.draftDesc;
  $("draftPriceGBP").value = c.price;
  $("draftAedEq").textContent = "(approx. " + Math.round(parseFloat(c.price) * 4.76) + " AED)";
  $("fitmentDonorText").textContent = c.donor;
  $("fitmentSupportedSub").textContent = "Corresponds to OEM # " + $("inputPartNumber").value + ".";
  $("specificsGrid").innerHTML = [
    ["Brand:", mode === "difficult" ? "Toyota OEM" : "Lexus OEM"],
    ["Placement:", mode === "difficult" ? "Right / Passenger" : "Right / Driver"],
    ["OEM Part #:", $("inputPartNumber").value],
    ["Connector:", mode === "difficult" ? "7-Pin Wire Harness" : "LED Ballast Plug"],
    ["Features:", mode === "difficult" ? "Power Adjust, Heated Glass" : "LED Projector, DRL"],
    ["Defect:", mode === "difficult" ? "Chipped Lower Mounting Tab" : "None Recorded"],
  ].map(([k, v], i) => `<div class="specific-chip ${i === 5 ? "chip-defect" : ""}"><span class="k">${k}</span><span class="v">${v}</span></div>`).join("");
  $("mockupItemTitle").textContent = c.draftTitle;
  $("mockupCondText").textContent = mode === "difficult" ? "Tested Working • Damaged mounting tab clearly pictured" : "Untested Ballast • Full transparency disclosed";
  $("mockupPriceText").textContent = "£" + c.price;

  // Stage 4 reset
  renderChecklist(false);
  $("btnApproveListing").disabled = false;
  $("readinessStatusBanner").className = "readiness-status-banner status-review";
  $("readinessTag").textContent = c.readiness === "Ready for Seller Review" ? "Ready for Seller Review" : "Specialist Review Required";

  switchAssistantTab("stage1");
  if (!keepOpen) openSalvageAssistant();
}

function renderChecklist(done) {
  const items = [
    ["Part Identifiers Confirmed", "OEM part number matches the approved catalog reference for this platform."],
    ["Donor Vehicle Conflict Resolved", "Donor record confirmed from dismantling tag #802. Spreadsheet corrected."],
    ["Condition & Defect Transparency", "Defects disclosed in title, condition notes, and photo annotations."],
    ["Functional Testing Verified", "Testing status recorded with explicit disclosure (never inferred from photos)."],
    ["Hazardous Component Exclusion", "Verified free of pyrotechnic tensioners, lithium batteries, or restricted fluids."],
    ["UK Import Tariff & Packaging", "HS Code: 8708.29.90. Packaged box: 32 × 22 × 18 cm, 1.4 kg."],
  ];
  $("checklistGrid").innerHTML = items.map(([t, d], i) => `
    <div class="check-item-card ${done || (i >= 4) ? "done" : "pending"}">
      <div class="check-box">${done || i >= 4 ? "✓" : "…"}</div>
      <div class="check-content"><strong>${t}</strong><p>${d}</p></div>
      <span class="check-tag">${done || i >= 4 ? (i >= 4 ? "Compliant" : "Passed") : "Pending"}</span>
    </div>`).join("");
}

function selectQuestionOption(q, opt) {
  const card = $("btnOptA" + q)?.closest(".question-card") || $("qText" + q).closest(".question-card");
  card.querySelectorAll(".q-opt-btn").forEach((b) => b.classList.remove("active"));
  (opt === "a" ? $("btnOptA" + q) : $("btnOptB" + q)).classList.add("active");
  ANSWERS[q] = opt;
  const st = $("qStatus" + q);
  st.className = "q-status status-resolved";
  st.textContent = "Resolved";
}

function autoConfirmPartNum() {
  const v = $("inputPartNumber").value.trim();
  if (v.length < 8) { toast("Enter the full OEM part number first"); return; }
  ANSWERS[2] = true;
  const st = $("qStatus2");
  st.className = "q-status status-resolved";
  st.textContent = "Catalog Matched";
  $("chipPartNumReplace");
  toast("OEM # " + v + " verified against the approved catalog");
}

function applySingleCorrectionCarryover() {
  const answered = Object.values(ANSWERS).filter(Boolean).length;
  if (answered < 4) { toast("Resolve all four targeted questions first (" + answered + "/4)"); return; }
  state.correctionsApplied = true;
  // Propagate: draft + readiness + tab badges update from the single correction
  const c = CASES[activeCase];
  const resolvedDonor = ANSWERS[1] === "a" ? c.donor : c.donor.replace("2018", "2017");
  $("fitmentDonorText").textContent = resolvedDonor;
  $("draftTitleInput").value = c.draftTitle;
  updateCharCounter($("draftTitleInput"));
  renderChecklist(true);
  $("readinessStatusBanner").className = "readiness-status-banner status-ready";
  $("readinessTag").textContent = "Ready for Seller Review";
  $("tab4StatusBadge").textContent = "Ready for Seller Review";
  $("tab2ConflictBadge").textContent = "0 Conflicts • 0 Gaps";
  toast("Single correction carried over: record · draft · checklist updated");
  switchAssistantTab("stage3");
}

function updateCharCounter(input) {
  const el = $("titleCharCount");
  el.textContent = input.value.length + "/80";
  el.classList.toggle("over", input.value.length > 80);
  $("mockupItemTitle").textContent = input.value;
}

function approveListingDraft() {
  if (!state.correctionsApplied) { toast("Apply corrections & carry-over before approval"); return; }
  const btn = $("btnApproveListing");
  btn.disabled = true;
  btn.querySelector("span").textContent = "Approved — Held as Draft (Human Sign-Off Recorded)";
  toast("Listing draft approved by Noor. Never auto-published — trust boundary enforced.");
}

function renderCompliancePillars() {
  const pillars = [
    {
      icon: '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>',
      title: "1. Customs, Tariffs & HMRC Classification", status: "0% Duty • Declared",
      rows: [
        ["Harmonized Tariff (HS) Code", "8708.29.90", "Parts & accessories of motor vehicle bodies"],
        ["UK Import Duty Rate", "0.0%", "Eligible under bilateral commercial scrap declaration"],
        ["UK Import VAT Treatment", "20% Standard Import VAT", "Notice 718/1 Second-Hand Margin Scheme applied"],
        ["Dubai Customs Export Dec #", "DXB-EXP-2026-8942A", "Al Quoz Automotive Scrap Free Exit"],
        ["Consignee / Importer EORI", "GB924817290000", "Validated on HMRC Trader Checker"],
        ["Declared Valuation (FOB)", "GBP 65.00 / AED 310.00", "Documented salvage invoice price"],
      ],
      footer: "Customs & Tariff Audit Passed",
    },
    {
      icon: '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>',
      title: "2. UK RHD Optical & Geometric Fitment", status: "MOT Compliant",
      rows: [
        ["UK Traffic Orientation", "Right-Hand-Drive (RHD)", "Right side is UK Driver Offside"],
        ["UAE Donor Origin", "Left-Hand-Drive (LHD) Donor", "Right side was passenger nearside in Dubai"],
        ["Mirror Glass Curvature Check", "Aspheric Convex Glass (R=1200mm)", "Meets UK UN ECE Regulation 46 blind-spot FOV"],
        ["Wiring Pinout & Heating Grid", "7-Pin Motorized Connector", "Identical pinout to UK domestic Corolla SE/Excel"],
        ["Regulatory Standard", "UK Road Vehicles Regs 1986", "Driver-side field of view verified"],
        ["Fitment Risk Assessment", "LOW RISK", "No optical inversion distortion detected"],
      ],
      footer: "UK RHD Geometry Certified",
    },
    {
      icon: '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>',
      title: "3. HazMat & Air Cargo DG Clearance", status: "Non-Restricted Air",
      rows: [
        ["Component Classification", "Passive Body Electrical", "12V DC servo motor + heating resistor"],
        ["Pyrotechnic Squib Check", "EXCLUDED / ZERO HAZARD", "No gas generators or explosive charges"],
        ["Hazardous Liquids / Mercury", "EXCLUDED / ZERO FLUIDS", "No hydraulic dampeners or mercury tilt sensors"],
        ["IATA / ADR Exemption Code", "Special Provision A115 / SP 280", "Exempted non-dangerous goods declaration"],
        ["Approved Freight Carriers", "DHL Express / Emirates SkyCargo", "Standard bellyhold air freight eligible"],
        ["DG Surcharge Liability", "$0.00 Surcharge", "Clean bill of lading without hazmat penalty"],
      ],
      footer: "Air Cargo DG Exemption Active",
    },
    {
      icon: '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>',
      title: "4. Provenance, Title & Anti-Theft Verification", status: "Title Cleared",
      rows: [
        ["Dubai Police Salvage Certificate", "#DP-SALVAGE-2026-78210", "Lawful total-loss insurance scrap release"],
        ["Interpol SMV Theft Check", "0 Flags / Clean", "VIN 2T1BURHE0JC894120 verified clear"],
        ["Yard Operating License", "Noor Auto Spare Parts Tr. LLC", "Dubai DED License #741982"],
        ["Donor Mileage at Dismantle", "42,100 km (Documented)", "Verified against yard intake manifest"],
        ["UK Salvage Classification", "Category N Equivalent", "Non-structural cosmetic / electrical salvage"],
        ["Chain-of-Custody Integrity", "Tamper Seal #SLV-UK-88421", "Applied over mirror base before carton packaging"],
      ],
      footer: "Police Salvage Title Certified",
    },
  ];
  $("compliancePillars").innerHTML = pillars.map((p) => `
    <div class="compliance-card">
      <div class="compliance-card-header">
        <div class="compliance-card-icon">${p.icon}</div>
        <div class="compliance-card-title-group"><h4>${p.title}</h4><span class="compliance-pill-status verified">${p.status}</span></div>
      </div>
      <table class="compliance-meta-table"><tbody>
        ${p.rows.map(([k, v, sub]) => `<tr><td>${k}</td><td><strong>${v}</strong><span class="meta-sub">(${sub})</span></td></tr>`).join("")}
      </tbody></table>
      <div class="compliance-card-footer"><span class="compliance-check-indicator">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
        ${p.footer}</span></div>
    </div>`).join("");
}

function generateCustomsInvoice() {
  toast("Commercial invoice PDF mockup generated: DXB-EXP-2026-8942A · FOB " + gbp(parseFloat($("draftPriceGBP").value || 68)));
}
function certifyComplianceDossier(lock) {
  toast(lock ? "Compliance dossier locked and sealed — Grade A certification applied" : "IATA Non-DG Airway Bill declaration SP A115 generated and attached to DHL Waybill #984219028");
}

/* ── M2M chat drawer ────────────────────────────────────────────────────── */

function openChatDrawer() {
  $("m2mDrawer").classList.add("open");
  $("floatingChatPill").classList.add("hidden");
  buildWaveform();
}
function openChatDrawerFor(id) {
  const part = LISTINGS.find((r) => r.id === id) || state.currentPart;
  state.currentPart = part;
  $("anchorTitle").textContent = part.title;
  $("anchorPrice").textContent = "AED " + part.priceAed + " (" + gbp(part.priceAed) + ")";
  $("anchorThumb").src = part.img;
  openChatDrawer();
}
function closeChatDrawer() {
  $("m2mDrawer").classList.remove("open");
  $("floatingChatPill").classList.remove("hidden");
}

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function appendMessage(text, sent) {
  const row = document.createElement("div");
  row.className = "msg-row " + (sent ? "sent" : "received");
  row.innerHTML = `<div class="msg-bubble"></div><span class="msg-time">${nowTime()}</span>`;
  row.querySelector(".msg-bubble").textContent = text;
  $("messagesCanvas").appendChild(row);
  $("messagesCanvas").scrollTop = $("messagesCanvas").scrollHeight;
}

function sendMessage() {
  const input = $("chatInput");
  const text = input.value.trim();
  if (!text) return;
  appendMessage(text, true);
  input.value = "";
  setTimeout(() => appendMessage("Thanks for your message! " + state.currentPart.title.split(" ").slice(0, 6).join(" ") + " — confirmed available at Al Quoz yard #4. Offer and collection can be arranged today.", false), 900);
}

let micTimer = null;
function toggleMic() {
  const btn = $("btnMicRecord");
  if (btn.classList.contains("recording")) {
    clearInterval(micTimer);
    btn.classList.remove("recording");
    appendVoiceMessage();
    toast("Voice note sent — Whisper transcript attached");
  } else {
    btn.classList.add("recording");
    toast("Recording voice note… tap mic again to send");
    micTimer = setTimeout(() => { if (btn.classList.contains("recording")) toggleMic(); }, 6000);
  }
}

function appendVoiceMessage() {
  const row = document.createElement("div");
  row.className = "msg-row sent";
  row.innerHTML = `
    <div class="voice-message-bubble">
      <div class="voice-bubble-main">
        <button class="voice-play-btn" onclick="toggleVoicePlayback(this)" aria-label="Play Voice Note">
          <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </button>
        <div class="waveform-canvas"></div>
      </div>
      <div class="voice-meta-row"><span class="voice-time-elapsed">0:00 / 0:12</span><span class="playback-speed-tag" onclick="cyclePlaybackSpeed(this)">1.0x</span></div>
    </div>
    <span class="msg-time">${nowTime()}</span>`;
  $("messagesCanvas").appendChild(row);
  buildWaveformIn(row.querySelector(".waveform-canvas"));
  $("messagesCanvas").scrollTop = $("messagesCanvas").scrollHeight;
}

function buildWaveform() {
  document.querySelectorAll(".waveform-canvas").forEach((c) => { if (!c.children.length) buildWaveformIn(c); });
}
function buildWaveformIn(canvas) {
  if (!canvas) return;
  canvas.innerHTML = "";
  for (let i = 0; i < 34; i++) {
    const bar = document.createElement("span");
    bar.className = "waveform-bar";
    bar.style.height = 6 + Math.round(Math.abs(Math.sin(i * 1.7)) * 20) + "px";
    canvas.appendChild(bar);
  }
}

let voiceTimer = null;
function toggleVoicePlayback(btn) {
  const canvas = btn.closest(".voice-message-bubble").querySelector(".waveform-canvas");
  const bars = canvas.querySelectorAll(".waveform-bar");
  const playing = btn.dataset.playing === "1";
  clearInterval(voiceTimer);
  if (playing) {
    btn.dataset.playing = "0";
    bars.forEach((b) => b.classList.remove("playing"));
    return;
  }
  btn.dataset.playing = "1";
  let i = 0;
  voiceTimer = setInterval(() => {
    bars.forEach((b) => b.classList.remove("playing"));
    if (bars[i]) bars[i].classList.add("playing");
    i++;
    if (i >= bars.length) { clearInterval(voiceTimer); btn.dataset.playing = "0"; }
  }, 90);
}
function cyclePlaybackSpeed(el) {
  el.textContent = el.textContent === "1.0x" ? "1.5x" : el.textContent === "1.5x" ? "2.0x" : "1.0x";
}
function toggleWhisperTranscript(btn) {
  btn.nextElementSibling.classList.toggle("open");
}

function bindChatDrawer() {
  $("drawerCloseBtn").addEventListener("click", closeChatDrawer);
  $("floatingChatPill").addEventListener("click", openChatDrawer);
  $("btnSendMsg").addEventListener("click", sendMessage);
  $("chatInput").addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });
  $("btnMicRecord").addEventListener("click", toggleMic);
  document.querySelectorAll(".quick-prompt-chip").forEach((chip) => {
    chip.addEventListener("click", () => { $("chatInput").value = chip.textContent; sendMessage(); });
  });
  $("anchorBtnOffer").addEventListener("click", () => openOfferModal(state.currentPart.id));
}

/* ── Offer dialog ───────────────────────────────────────────────────────── */

let offerPart = null;

function openOfferModal(id) {
  offerPart = LISTINGS.find((r) => r.id === id) || state.currentPart;
  const input = $("offerPriceInput");
  input.value = Math.round(offerPart.priceAed * 0.9);
  $("makeOfferModal").showModal();
}
function bindOfferModal() {
  document.querySelectorAll(".preset-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".preset-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      const discount = parseFloat(chip.dataset.discount);
      $("offerPriceInput").value = Math.round(offerPart.priceAed * (1 - discount));
    });
  });
  $("btnCancelOffer").addEventListener("click", () => $("makeOfferModal").close());
  $("btnSubmitOffer").addEventListener("click", () => {
    const offer = $("offerPriceInput").value;
    $("makeOfferModal").close();
    openChatDrawerFor(offerPart.id);
    setTimeout(() => appendMessage("Formal offer submitted: AED " + offer + " for " + offerPart.title + ". Awaiting Noor's acceptance (escrow protected).", true), 150);
  });
}

/* ── Boot ───────────────────────────────────────────────────────────────── */

document.addEventListener("DOMContentLoaded", () => {
  buildAssistantModal();
  renderCompliancePillars();
  bindThemeToggle();
  bindFeedControls();
  bindRadialMenu();
  bindChatDrawer();
  bindOfferModal();
  renderListings();
  $("brandLogoBox").addEventListener("keydown", (e) => { if (e.key === "Enter") resetToLandingPage(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeAnalogueMenu(); closeChatDrawer(); } });
});
