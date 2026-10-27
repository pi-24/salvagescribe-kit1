// public/js/i18n.js — UI strings for EN/AR

const I18N = {
  en: {
    col_ready: "Ready for seller review",
    col_info: "Information missing",
    col_specialist: "Specialist review required",
    ask_assistant: "Ask SalvageScribe",
    send: "Send",
    type_message: "Type your message...",
    back: "← Back to board",
    back_detail: "← Back to detail",
    view_draft: "View draft →",
    view_readiness: "Readiness checklist →",
    ledger_title: "Evidence Ledger",
    questions_title: "Open Questions",
    no_questions: "All attributes verified — no open questions.",
    confirm: "Confirm",
    confirmed: "✓ Verified",
    draft_title: "Listing Draft",
    draft_blocked: "Draft blocked",
    draft_blocked_msg: "This part cannot be drafted yet. Resolve the blocking issues in the detail panel.",
    title_field: "Title (max 80 chars)",
    description_field: "Description (markdown)",
    category_field: "Suggested category",
    condition_block: "Condition Disclosure",
    compat_block: "Compatibility",
    compat_donor: "Donor vehicle (recorded)",
    compat_confirmed: "Confirmed fitment (from reference)",
    compat_unverified: "Unverified",
    approve_btn: "Approve listing",
    approve_disabled: "Resolve all issues before approving",
    approved_msg: "✓ Listing approved by seller",
    readiness_title: "Readiness Checklist",
    actions_title: "Prioritised Actions",
    no_actions: "No actions required.",
    banner: "Test checklist — not legal, customs or compliance clearance.",
    ingesting: "Loading part data...",
    generate_draft: "Generate draft",
    saving: "Saving...",
    saved: "Saved",
    rule_id: "Rule",
    result: "Result",
    detail: "Detail",
    priority: "Priority",
    action_text: "Action",
    suggested_question: "Suggested question:",
    answer_question: "Answer this question",
  },
  ar: {
    col_ready: "جاهز لمراجعة البائع",
    col_info: "معلومات ناقصة",
    col_specialist: "يتطلب مراجعة أخصائي",
    ask_assistant: "اسأل SalvageScribe",
    send: "إرسال",
    type_message: "اكتب رسالتك...",
    back: "→ العودة إلى اللوحة",
    back_detail: "→ العودة إلى التفاصيل",
    view_draft: "عرض المسودة ←",
    view_readiness: "قائمة الفحص ←",
    ledger_title: "سجل الأدلة",
    questions_title: "الأسئلة المفتوحة",
    no_questions: "جميع السمات موثقة — لا أسئلة مفتوحة.",
    confirm: "تأكيد",
    confirmed: "✓ موثق",
    draft_title: "مسودة الإعلان",
    draft_blocked: "المسودة محظورة",
    draft_blocked_msg: "لا يمكن إنشاء مسودة لهذه القطعة بعد. حل المشاكل المعطلة في لوحة التفاصيل.",
    title_field: "العنوان (حد أقصى ٨٠ حرف)",
    description_field: "الوصف (ماركداون)",
    category_field: "الفئة المقترحة",
    condition_block: "الإفصاح عن الحالة",
    compat_block: "التوافق",
    compat_donor: "سيارة المصدر (مسجلة)",
    compat_confirmed: "توافق مؤكد (من المرجع)",
    compat_unverified: "غير موثق",
    approve_btn: "اعتماد الإعلان",
    approve_disabled: "حل جميع المشاكل قبل الاعتماد",
    approved_msg: "✓ تم اعتماد الإعلان من البائع",
    readiness_title: "قائمة فحص الجاهزية",
    actions_title: "الإجراءات ذات الأولوية",
    no_actions: "لا توجد إجراءات مطلوبة.",
    banner: "قائمة فحص تجريبية — ليست مخلصة قانونياً أو جمركياً.",
    ingesting: "جاري تحميل بيانات القطعة...",
    generate_draft: "إنشاء مسودة",
    saving: "جاري الحفظ...",
    saved: "تم الحفظ",
    rule_id: "القاعدة",
    result: "النتيجة",
    detail: "التفاصيل",
    priority: "الأولوية",
    action_text: "الإجراء",
    suggested_question: "السؤال المقترح:",
    answer_question: "أجب على هذا السؤال",
  },
};

let currentLang = "en";

function t(key) {
  return (I18N[currentLang] && I18N[currentLang][key]) || I18N.en[key] || key;
}

function setLang(lang) {
  currentLang = lang;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";

  // Update all data-i18n elements
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });

  // Update placeholders
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    el.placeholder = t(el.getAttribute("data-i18n-ph"));
  });

  // Toggle lang button text
  document.querySelector(".lang-en").style.display = lang === "en" ? "" : "none";
  document.querySelector(".lang-ar").style.display = lang === "ar" ? "" : "none";

  // Re-render current screen
  if (window.App && App.currentPartId) {
    App.renderCurrentScreen();
  } else if (window.Board) {
    Board.render();
  }
}
