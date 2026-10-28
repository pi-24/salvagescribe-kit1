// src/questions.js — targeted question generation (spec §4, §5)
//
// Questions are generated from ledger rows whose status is NOT VERIFIED.
// Max 6 questions, ordered by priority:
//   exclusion/safety → part_number → side → structural_damage →
//   cosmetic_condition → tested → included_components → features →
//   packaged_dimensions_cm / packaged_weight_kg
//
// Each question object:
//   { question_id, attribute, text, options?, why, evidence: [source_refs] }
//
// For CONFLICTING rows, options are the candidate values + "Other".
//
// Text is generated with the model (via callModel) but ORDERING is kept
// in code — the model never reorders.  Arabic output must be natural
// (not transliterated).
//
// confirmAnswer() accepts answers in EN or AR, normalises yes/no/LH/RH/
// years in code, stores raw answer + English translation on the ledger
// row, calls confirm() → resolve(), returns the updated ledger.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { callModel } from "./llm.js";
import { confirm, resolve, ledgerToJSON, resolveAll, STATUS } from "./ledger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = join(__dirname, "prompts", "questions.txt");

let _systemPrompt = null;
function systemPrompt() {
  if (!_systemPrompt) {
    _systemPrompt = readFileSync(PROMPT_PATH, "utf8");
  }
  return _systemPrompt;
}

// ── Priority order (spec §5) ────────────────────────────────────────────────
// Lower index = higher priority.
const PRIORITY_ORDER = [
  "part_type", // exclusion/safety
  "part_number",
  "side",
  "structural_damage",
  "cosmetic_condition",
  "tested",
  "included_components",
  "features",
  "packaged_dimensions_cm",
  "packaged_weight_kg",
  // fallback: anything else not listed above
];

function priorityRank(attr) {
  const idx = PRIORITY_ORDER.indexOf(attr);
  return idx === -1 ? 99 : idx;
}

// ── Question template per attribute (EN + AR fallback) ─────────────────────
// Used as the model's input context; also serves as the MOCK fallback when
// the model is unavailable.
const QUESTION_TEMPLATES = {
  en: {
    part_type: {
      why: "Safety/exclusion check: confirm this part is safe to list.",
      text: (row) => `Is this a side-view mirror (not an airbag, battery, or other excluded part)?`,
    },
    part_number: {
      why: "A verified part number is required to confirm fitment from the reference table.",
      text: (row) => {
        if (row.value && String(row.value).includes("?")) {
          return `The label shows "${row.value}" but some digits are unreadable. Can you provide the full part number, or confirm the partial reading?`;
        }
        return "What is the exact part number on the label?";
      },
    },
    side: {
      why: "Side (LH/RH) must be verified before listing.",
      text: (row) => "Which side is this mirror — left (LH) or right (RH)?",
    },
    structural_damage: {
      why: "Structural damage must be disclosed. Photos may show possible damage that needs confirmation.",
      text: (row) => {
        if (row.value && row.value !== "none") {
          return `Photos show possible structural damage: "${row.value}". Can you confirm whether this damage is present?`;
        }
        return "Is there any structural damage (mounting tab, housing)?";
      },
    },
    cosmetic_condition: {
      why: "Cosmetic condition must be disclosed in the listing.",
      text: (row) => {
        if (row.value && row.value !== "none") {
          return `Photos suggest: "${row.value}". Can you confirm the cosmetic condition?`;
        }
        return "What is the cosmetic condition (scratches, scuffs, fading)?";
      },
    },
    tested: {
      why: "Electrical test status must be stated. No 'working/functional' claim unless tested OK.",
      text: (row) => {
        if (row.value === "untested" || !row.value) {
          return "Has this mirror been electrically tested? (tested OK / tested with fault / untested)";
        }
        return "Please confirm the electrical test result (tested OK / tested with fault / untested).";
      },
    },
    included_components: {
      why: "Included components must be listed; anything missing must be stated.",
      text: (row) => "What components are included (cover, glass, harness, signal lens, camera)?",
    },
    features: {
      why: "Features (heated, folding, signal, camera, blind-spot) must be stated and consistent.",
      text: (row) => "Which features does this mirror have (heated, folding, signal, camera, blind-spot)?",
    },
    packaged_dimensions_cm: {
      why: "Packaged dimensions are required for shipping.",
      text: (row) => "What are the packaged dimensions (length × width × height in cm)?",
    },
    packaged_weight_kg: {
      why: "Packaged weight is required for shipping.",
      text: (row) => "What is the packaged weight (kg)?",
    },
    donor_make: {
      why: "Donor vehicle make must be verified and non-conflicting.",
      text: (row) => "What is the donor vehicle make?",
    },
    donor_model: {
      why: "Donor vehicle model must be verified and non-conflicting.",
      text: (row) => "What is the donor vehicle model?",
    },
    donor_year: {
      why: "Donor vehicle year must be verified and non-conflicting.",
      text: (row) => {
        if (row.status === STATUS.CONFLICTING) {
          return "Sources disagree on the donor year. Which year is correct?";
        }
        return "What year is the donor vehicle?";
      },
    },
    manufacturer: {
      why: "Manufacturer (OEM/aftermarket) must be verified.",
      text: (row) => "Is this an OEM or aftermarket part?",
    },
    glass_condition: {
      why: "Glass condition must be disclosed.",
      text: (row) => "What is the glass condition (clear, scratched, chipped, cracked)?",
    },
    colour: {
      why: "Colour/paint code is optional but useful for matching.",
      text: (row) => "What is the colour or paint code?",
    },
  },
  ar: {
    part_type: {
      why: "فحص الأمان: تأكيد أن القطعة آمنة للعرض.",
      text: (row) => "هل هذه مرآة جانبية (وليس وسادة هوائية أو بطارية أو قطعة مستبعدة)؟",
    },
    part_number: {
      why: "رقم القطعة يجب التحقق منه لتأكيد التوافق من الجدول المرجعي.",
      text: (row) => {
        if (row.value && String(row.value).includes("?")) {
          return `الملصق يظهر "${row.value}" لكن بعض الأرقام غير مقروءة. هل يمكنك توفير الرقم الكامل؟`;
        }
        return "ما هو رقم القطعة الموجود على الملصق؟";
      },
    },
    side: {
      why: "يجب التحقق من الجهة (يسار/يمين) قبل العرض.",
      text: (row) => "هل هذه المرآة يسرى (LH) أم يمنى (RH)؟",
    },
    structural_damage: {
      why: "يجب الإفصاح عن الضرر الهيكلي. قد تظهر الصور ضرراً محتملاً يحتاج تأكيداً.",
      text: (row) => {
        if (row.value && row.value !== "none") {
          return `تظهر الصور ضرراً هيكلياً محتملاً: "${row.value}". هل يمكنك تأكيد ما إذا كان هذا الضرر موجوداً؟`;
        }
        return "هل يوجد أي ضرر هيكلي (لسان التثبيت، الغلاف)؟";
      },
    },
    cosmetic_condition: {
      why: "يجب الإفصاح عن الحالة التجميلية في الإعلان.",
      text: (row) => {
        if (row.value && row.value !== "none") {
          return `تشير الصور إلى: "${row.value}". هل يمكنك تأكيد الحالة التجميلية؟`;
        }
        return "ما هي الحالة التجميلية (خدوش، جروح، بهتان)؟";
      },
    },
    tested: {
      why: "يجب ذكر حالة الفحص الكهربائي. لا يُقال \"يعمل\" إلا إذا تم الفحص بنجاح.",
      text: (row) => {
        if (row.value === "untested" || !row.value) {
          return "هل تم فحص هذه المرآة كهربائياً؟ (مفحوصة تعمل / مفحوصة بها عطل / غير مفحوصة)";
        }
        return "يرجى تأكيد نتيجة الفحص الكهربائي (مفحوصة تعمل / مفحوصة بها عطل / غير مفحوصة).";
      },
    },
    included_components: {
      why: "يجب سرد المكونات المضمنة، وذكر أي شيء مفقود.",
      text: (row) => "ما المكونات المضمنة (الغطاء، الزجاج، الأسلاك، عدلة الإشارة، الكاميرا)؟",
    },
    features: {
      why: "يجب ذكر الميزات (تدفئة، طي، إشارة، كاميرا، نقطة عمياء) والتأكد من تطابقها.",
      text: (row) => "ما هي ميزات هذه المرآة (تدفئة، طي، إشارة، كاميرا، نقطة عمياء)؟",
    },
    packaged_dimensions_cm: {
      why: "أبعاد التغليف مطلوبة للشحن.",
      text: (row) => "ما هي أبعاد التغليف (الطول × العرض × الارتفاع بالسنتيمتر)؟",
    },
    packaged_weight_kg: {
      why: "وزن التغليف مطلوب للشحن.",
      text: (row) => "ما هو وزن التغليف (كيلوغرام)؟",
    },
    donor_make: {
      why: "يجب التحقق من ماركة سيارة المصدر وألا تكون متعارضة.",
      text: (row) => "ما هي ماركة سيارة المصدر؟",
    },
    donor_model: {
      why: "يجب التحقق من موديل سيارة المصدر وألا يكون متعارضاً.",
      text: (row) => "ما هو موديل سيارة المصدر؟",
    },
    donor_year: {
      why: "يجب التحقق من سنة سيارة المصدر وألا تكون متعارضة.",
      text: (row) => {
        if (row.status === STATUS.CONFLICTING) {
          return "المصادر تختلف حول سنة سيارة المصدر. أي سنة صحيحة؟";
        }
        return "ما هي سنة سيارة المصدر؟";
      },
    },
    manufacturer: {
      why: "يجب التحقق من المصنّع (أصلي/بديل).",
      text: (row) => "هل هذه قطعة أصلية (OEM) أم بديلة؟",
    },
    glass_condition: {
      why: "يجب الإفصاح عن حالة الزجاج.",
      text: (row) => "ما هي حالة الزجاج (نظيف، مخدوش، متشقق، مكسور)؟",
    },
    colour: {
      why: "اللون/رمز الطلاء اختياري لكنه مفيل للمطابقة.",
      text: (row) => "ما هو اللون أو رمز الطلاء؟",
    },
  },
};

// ── generateQuestions(ledger, lang) ────────────────────────────────────────
// Returns up to 6 prioritised questions for non-VERIFIED ledger rows.

export async function generateQuestions(ledger, lang = "en") {
  const j = ledgerToJSON(ledger);
  const templates = QUESTION_TEMPLATES[lang] ?? QUESTION_TEMPLATES.en;

  // Collect non-VERIFIED rows
  const openAttrs = Object.entries(j.ledger)
    .filter(([, row]) => row.status && row.status !== STATUS.VERIFIED)
    .map(([attr, row]) => ({ attr, row }));

  // Sort by priority order
  openAttrs.sort((a, b) => priorityRank(a.attr) - priorityRank(b.attr));

  // Take max 6
  const top = openAttrs.slice(0, 6);

  // Build question objects
  const questions = top.map(({ attr, row }) => {
    const template = templates[attr] ?? {
      why: `Attribute "${attr}" needs confirmation.`,
      text: () => `Please confirm the value for ${attr}.`,
    };

    // Build options for CONFLICTING rows
    let options = undefined;
    if (row.status === STATUS.CONFLICTING) {
      const candidateValues = [
        ...new Set(
          row.candidates
            .filter((c) => c.source !== "seller_confirmed")
            .map((c) => String(c.value)),
        ),
      ];
      options = [...candidateValues, "Other"];
    }

    // Also add options for specific attributes
    if (!options && attr === "tested") {
      options = ["tested_ok", "tested_fault", "untested"];
    }
    if (!options && attr === "side") {
      options = ["LH", "RH"];
    }
    if (!options && attr === "manufacturer") {
      options = ["OEM", "aftermarket"];
    }

    // Evidence: source_refs from candidates
    const evidence = row.candidates
      .map((c) => c.source_ref)
      .filter((r) => r);

    return {
      question_id: row.question_id,
      attribute: attr,
      text: template.text(row),
      options,
      why: template.why,
      evidence,
    };
  });

  // If not in MOCK mode, try to refine question text with the model.
  // Ordering stays in code — the model only generates text.
  if (questions.length > 0 && process.env.MOCK !== "1") {
    try {
      const refined = await refineWithModel(questions, j, lang);
      return refined;
    } catch {
      // Fall back to template text if model fails
      return questions;
    }
  }

  return questions;
}

// ── refineWithModel ─────────────────────────────────────────────────────────
// Calls the model to generate natural-language question text in EN or AR.
// The model receives the question skeleton (attribute, why, evidence, options)
// and returns { questions: [{question_id, text}] }.  Ordering is NOT changed.

async function refineWithModel(questions, ledgerJSON, lang) {
  const system = systemPrompt();
  const user = [
    `Language: ${lang === "ar" ? "Arabic (natural, not transliterated)" : "English"}`,
    "",
    `Part: ${ledgerJSON.part_id}`,
    `Spreadsheet: ${ledgerJSON.spreadsheet_row?.description ?? "(none)"}`,
    "",
    "Generate clear, concise question text for each question below.",
    "Keep the question_id, attribute, options, why, and evidence unchanged.",
    "Only replace the text field with your generated text.",
    "",
    "Questions:",
    JSON.stringify(
      questions.map((q) => ({
        question_id: q.question_id,
        attribute: q.attribute,
        current_text: q.text,
        why: q.why,
        options: q.options,
        evidence: q.evidence,
      })),
      null,
      2,
    ),
  ].join("\n");

  const schema = {
    type: "object",
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question_id: { type: "string" },
            text: { type: "string" },
          },
          required: ["question_id", "text"],
          additionalProperties: false,
        },
      },
    },
    required: ["questions"],
    additionalProperties: false,
  };

  const mockKey = `questions_${ledgerJSON.part_id}_${lang}`;
  const resp = await callModel({ system, user, jsonSchema: schema, mockKey });

  // Merge refined text back, keeping original ordering and structure
  const textMap = new Map(
    (resp.questions ?? []).map((q) => [q.question_id, q.text]),
  );

  return questions.map((q) => ({
    ...q,
    text: textMap.get(q.question_id) ?? q.text,
  }));
}

// ── confirmAnswer(ledger, attr, value, lang) ────────────────────────────────
// Accepts an answer in EN or AR.  Normalises yes/no/LH/RH/years in code.
// Stores raw answer + English translation on the ledger row.
// Calls confirm() → resolve().  Returns updated ledger JSON.

const AR_YES = /^(نعم|ايوة|أيوة|yes)$/i;
const AR_NO = /^(لا|لأ|no)$/i;
const AR_LH = /^(يسار|يسرى|left|lh)$/i;
const AR_RH = /^(يمين|يمنى|right|rh)$/i;

export function confirmAnswer(ledger, attr, value, lang = "en") {
  const row = ledger.ledger[attr];
  if (!row) {
    throw new Error(`Attribute "${attr}" not found in ledger for ${ledger.part_id}`);
  }

  // Store raw answer + lang on the row for audit trail
  if (!row.answers) row.answers = [];
  row.answers.push({
    raw: value,
    lang,
    timestamp: new Date().toISOString(),
  });

  // Normalise the value
  const normalised = normaliseAnswer(attr, value, lang);

  // Store English translation of the raw answer
  let enTranslation = value;
  if (lang === "ar") {
    enTranslation = translateAnswerToEnglish(attr, value);
  }

  row.last_answer = { raw: value, normalised, lang, en: enTranslation };

  // Call confirm() which sets seller_confirmed candidate → VERIFIED
  confirm(ledger, attr, normalised);

  // Return updated ledger JSON
  return ledgerToJSON(ledger);
}

// ── normaliseAnswer(attr, value, lang) ──────────────────────────────────────

function normaliseAnswer(attr, value, lang) {
  const v = String(value).trim();

  // --- tested ---
  if (attr === "tested") {
    if (/^(tested.?ok|ok|works|نعم|ايوة|أيوة|yes)$/i.test(v)) return "tested_ok";
    if (/^(tested.?fault|fault|broken|defective|لا يعمل|عطل|لا|no)$/i.test(v)) return "tested_fault";
    if (/^(untested|not tested|none|غير مفحوص|لم يتم|مافي فحص)$/i.test(v)) return "untested";
    // Fallback: keep raw
    return v;
  }

  // --- side ---
  if (attr === "side") {
    if (AR_LH.test(v) || /\blh\b/i.test(v) || /left/i.test(v)) return "LH";
    if (AR_RH.test(v) || /\brh\b/i.test(v) || /right/i.test(v)) return "RH";
    return v.toUpperCase();
  }

  // --- donor_year (and any year-like answer) ---
  if (attr === "donor_year") {
    const year = Number(v);
    if (!Number.isNaN(year)) return year;
    // Arabic numeral extraction (e.g. ٢٠١٨ → 2018)
    const arDigits = v.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
    const arYear = Number(arDigits);
    if (!Number.isNaN(arYear)) return arYear;
    return v;
  }

  // --- manufacturer ---
  if (attr === "manufacturer") {
    if (/^(oem|أصلي|الاصلي|اصلي)$/i.test(v)) return "OEM";
    if (/^(aftermarket|بديل|البديل)$/i.test(v)) return "aftermarket";
    return v;
  }

  // --- cosmetic_condition / structural_damage ---
  if (attr === "cosmetic_condition" || attr === "structural_damage") {
    if (AR_NO.test(v) || /^(no|none|لا|لا يوجد|سليم)$/i.test(v)) return "none";
    // Otherwise keep the description as-is (may be free text in EN or AR)
    return v;
  }

  // --- generic yes/no normalisation ---
  if (AR_YES.test(v) || /^yes$/i.test(v)) return "yes";
  if (AR_NO.test(v) || /^no$/i.test(v)) return "no";

  // Fallback: return as-is
  return v;
}

// ── translateAnswerToEnglish(attr, value) ───────────────────────────────────
// Lightweight in-code translation for common answer patterns.  For complex
// free-text AR answers, the full translation would come from the model.

function translateAnswerToEnglish(attr, value) {
  const v = String(value).trim();

  // Year (Arabic-Indic digits)
  const arDigits = v.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
  if (/^\d{4}$/.test(arDigits)) return arDigits;

  // Side
  if (AR_LH.test(v)) return "LH";
  if (AR_RH.test(v)) return "RH";

  // Tested
  if (/نعم|ايوة|أيوة|yes/i.test(v)) return "tested_ok";
  if (/لا يعمل|عطل/i.test(v)) return "tested_fault";
  if (/غير مفحوص|لم يتم|مافي فحص/i.test(v)) return "untested";

  // Damage
  if (/لا|لا يوجد|سليم/i.test(v)) return "none";
  if (/شرخ|تشقق|cracked/i.test(v)) return "cracked";
  if (/خدش/i.test(v)) return "scratched";

  // Manufacturer
  if (/أصلي|الاصلي|اصلي/i.test(v)) return "OEM";
  if (/بديل|البديل/i.test(v)) return "aftermarket";

  // Default: return the original (the model would handle complex text)
  return v;
}
