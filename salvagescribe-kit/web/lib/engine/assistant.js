// src/assistant.js — "Ask SalvageScribe" free-text assistant (spec §6 guardrail G5)
//
// Noor can type free text. The assistant is called as a model call with the
// guardrail rules in the system prompt (src/prompts/assistant.txt).
//
// CRITICAL: after the model returns, we do a CODE CHECK that no ledger row
// changed. The model has NO write access to the ledger — it only produces a
// text reply + a suggested question_id. We snapshot the ledger before and
// after, and if anything changed we reject the response.
//
// The assistant also has a MOCK mode that recognises common refusal patterns
// ("just say it fits", "mark it as tested", "say no damage") and returns
// canned guardrail replies without calling the model.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { callModel } from "./llm.js";
import { ledgerToJSON } from "./ledger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = join(__dirname, "prompts", "assistant.txt");

let _systemPrompt = null;
function systemPrompt() {
  if (!_systemPrompt) {
    _systemPrompt = readFileSync(PROMPT_PATH, "utf8");
  }
  return _systemPrompt;
}

const ASSISTANT_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    suggested_question_id: { type: ["string", "null"] },
    suggested_attribute: { type: ["string", "null"] },
    ledger_changed: { type: "boolean" },
  },
  required: ["reply", "suggested_question_id", "suggested_attribute", "ledger_changed"],
  additionalProperties: false,
};

// ── MOCK pattern matching ──────────────────────────────────────────────────
// Recognises common "shortcut" requests and returns guardrail replies.
// This allows the demo to work with MOCK=1 without a model.

function mockReply(text, ledgerJSON, lang) {
  const lower = text.toLowerCase();
  const isAr = lang === "ar";

  // Fitment shortcut
  if (/(fit|fits|compatible|compatibility|توافق|يناسب).*all|all.*(corolla|camry|civic|toyota|هوندا|تويوتا)|just say it fits|قول إنه يناسب/i.test(lower)) {
    const pnRow = ledgerJSON.ledger.part_number;
    const pnStatus = pnRow?.status;
    const pnVal = pnRow?.value;
    return {
      reply: isAr
        ? `لا يمكنني إضافة ادعاء توافق بدون دليل. يتطلب блок التوافق إما رقم قطعة موثق يطابق الجدول المرجعي، أو بيان "غير موثق" صريح. ${pnStatus === "PARTIAL" ? `الملصق يظهر "${pnVal}" لكن بعض الأرقام غير مقروءة.` : ""} لتأكيد التوافق، أحتاج الرقم الكامل من صورة الملصق. هل تريد الإجابة على سؤال رقم القطعة؟`
        : `I can't add a fitment claim without evidence. The compatibility block requires either a verified part number matching the reference table, or an explicit "unverified" statement. ${pnStatus === "PARTIAL" ? `The label shows "${pnVal}" but some digits are unreadable. ` : ""}To confirm fitment, I need the full part number from the label photo. Would you like to answer the part-number question?`,
      suggested_question_id: pnRow?.question_id ?? `Q-${ledgerJSON.part_id}-part_number`,
      suggested_attribute: "part_number",
      ledger_changed: false,
    };
  }

  // Tested shortcut
  if (/(mark|say|set|put).*tested|tested.*ok|just say.*works|قول إنه يعمل|حدده كمفحوص|ضع فحص/i.test(lower)) {
    const testedRow = ledgerJSON.ledger.tested;
    return {
      reply: isAr
        ? `لا يمكنني تعيين حالة الفحص إلى "مفحوصة تعمل" بدون دليل — ذلك سيسمح بكلمة "يعمل" في الوصف، وهو مسموح فقط عندما تكون الحالة tested_ok موثقة. إذا قمت بفحص هذه المرآة، يرجى تأكيد النتيجة عبر سؤال الفحص (مفحوصة تعمل / مفحوصة بها عطل / غير مفحوصة).`
        : `I can't set the test status to "tested OK" without evidence — that would allow "working" in the description, which is only permitted when tested_ok is verified. If you've bench-tested this mirror, confirm the result via the tested question (tested OK / tested with fault / untested).`,
      suggested_question_id: testedRow?.question_id ?? `Q-${ledgerJSON.part_id}-tested`,
      suggested_attribute: "tested",
      ledger_changed: false,
    };
  }

  // Damage shortcut
  if (/(say|mark|put).*no damage|no.*damage|nothing wrong|perfect condition|قول لا يوجد ضرر|لا يوجد ضرر|سليم تماما/i.test(lower)) {
    const dmgRow = ledgerJSON.ledger.structural_damage;
    return {
      reply: isAr
        ? `لا يمكنني تعيين الضرر الهيكلي إلى "لا شيء" بدون تأكيد. قد تُظهر الصور ضرراً لا أستطيع التحقق منه. يرجى تأكيد ذلك عبر سؤال الضرر الهيكلي.`
        : `I can't set structural damage to "none" without confirmation. Photos may show damage that I can't verify. Please confirm via the structural-damage question.`,
      suggested_question_id: dmgRow?.question_id ?? `Q-${ledgerJSON.part_id}-structural_damage`,
      suggested_attribute: "structural_damage",
      ledger_changed: false,
    };
  }

  // OEM shortcut
  if (/(say|mark|put|just).*oem|oem.*it looks|قول أصلي|ضع OEM/i.test(lower)) {
    const mfgRow = ledgerJSON.ledger.manufacturer;
    return {
      reply: isAr
        ? `لا يمكنني تعيين المصنّع إلى "أصلي" بناءً على المظهر فقط. يجب أن يأتي من صورة الملصق. هل يمكنك تأكيد ذلك عبر سؤال المصنّع؟`
        : `I can't set manufacturer to "OEM" based on appearance alone. It must come from the label photo. Can you confirm via the manufacturer question?`,
      suggested_question_id: mfgRow?.question_id ?? `Q-${ledgerJSON.part_id}-manufacturer`,
      suggested_attribute: "manufacturer",
      ledger_changed: false,
    };
  }

  // Legitimate questions get a helpful reply
  if (/(what|which|how many|photos|need|missing|what.*need|ماذا|ما.*أحتاج|كم|ناقص|صور)/i.test(lower)) {
    const notVerified = Object.entries(ledgerJSON.ledger)
      .filter(([, row]) => row.status !== "VERIFIED")
      .map(([attr]) => attr);
    return {
      reply: isAr
        ? `السمات غير الموثقة بعد: ${notVerified.join("، ") || "لا شيء — كل شيء موثق!"}. أجب على الأسئلة في لوحة التفاصيل لتأكيد كل سمة.`
        : `Attributes still not verified: ${notVerified.join(", ") || "none — everything is verified!"}. Answer the questions in the detail panel to confirm each attribute.`,
      suggested_question_id: null,
      suggested_attribute: null,
      ledger_changed: false,
    };
  }

  // Default fallback
  return {
    reply: isAr
      ? `أنا هنا لمساعدتك في ملء الأدلة الناقصة. لا أستطيع إضافة أي معلومات بدون مصدر. يمكنك تأكيد السمات عبر لوحة الأسئلة، أو اسألني عن ما تحتاجه.`
      : `I'm here to help you fill in missing evidence. I can't add any information without a source. You can confirm attributes via the questions panel, or ask me what you still need.`,
    suggested_question_id: null,
    suggested_attribute: null,
    ledger_changed: false,
  };
}

// ── snapshot / diff ─────────────────────────────────────────────────────────
// Snapshot the ledger values+statuses so we can verify nothing changed.

function snapshot(ledgerJSON) {
  const snap = {};
  for (const [attr, row] of Object.entries(ledgerJSON.ledger)) {
    snap[attr] = { value: row.value, status: row.status };
  }
  return snap;
}

function diffSnapshots(before, after) {
  const changes = [];
  for (const attr of Object.keys(before)) {
    if (JSON.stringify(before[attr]) !== JSON.stringify(after[attr])) {
      changes.push({
        attribute: attr,
        before: before[attr],
        after: after[attr],
      });
    }
  }
  return changes;
}

// ── Main entry point ────────────────────────────────────────────────────────

export async function askAssistant(ledger, text, lang = "en") {
  const ledgerJSON = ledgerToJSON(ledger);
  const before = snapshot(ledgerJSON);

  let result;

  if (process.env.MOCK === "1" || !process.env.LLM_API_KEY) {
    result = mockReply(text, ledgerJSON, lang);
  } else {
    const userPrompt = [
      `Part ID: ${ledgerJSON.part_id}`,
      `Language: ${lang}`,
      "",
      "Current ledger (attribute → value, status):",
      JSON.stringify(
        Object.fromEntries(
          Object.entries(ledgerJSON.ledger).map(([attr, row]) => [
            attr,
            { value: row.value, status: row.status, question_id: row.question_id },
          ]),
        ),
        null,
        2,
      ),
      "",
      `Noor says: "${text}"`,
    ].join("\n");

    result = await callModel({
      system: systemPrompt(),
      user: userPrompt,
      jsonSchema: ASSISTANT_SCHEMA,
      mockKey: null,
    });
  }

  // CODE CHECK: verify no ledger row changed
  const afterJSON = ledgerToJSON(ledger);
  const after = snapshot(afterJSON);
  const changes = diffSnapshots(before, after);

  if (changes.length > 0) {
    // This should never happen — the model has no write access.
    // If it does, reject and log.
    console.error("ASSISTANT GUARDRAIL: ledger changed unexpectedly:", changes);
    return {
      reply:
        lang === "ar"
          ? "خطأ: حصل تغيير غير متوقع في السجل. تم رفض الرد."
          : "Error: the ledger changed unexpectedly. Response rejected.",
      suggested_question_id: null,
      suggested_attribute: null,
      ledger_changed: false,
      guardrail_violation: true,
      changes,
    };
  }

  // Force ledger_changed to false regardless of what the model said
  result.ledger_changed = false;

  return {
    ...result,
    part_id: ledgerJSON.part_id,
  };
}
