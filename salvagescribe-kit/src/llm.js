// src/llm.js — the ONE module through which every LLM call goes.
//
// callModel({ system, user, images, jsonSchema }) → parsed JSON
//
// Provider config is read from .env:
//   LLM_BASE_URL  — OpenAI-compatible chat/completions endpoint
//   LLM_API_KEY   — API key
//   LLM_MODEL     — model name (pin one for reproducible demo)
//
// MOCK=1 mode: returns canned responses from data/mock_responses/ so the
// UI can be demoed with zero credits.  The caller passes a `mockKey` field
// in the call object (e.g. "ingest_MIR-004") to select the canned file.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Load .env if present (dotenv is a dependency)
try {
  const dotenv = await import("dotenv");
  dotenv.config();
} catch {
  // dotenv optional in P1; env vars may already be set
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const MOCK_DIR = join(DATA_DIR, "mock_responses");

const MOCK = process.env.MOCK === "1";
const BASE_URL = process.env.LLM_BASE_URL || "";
const API_KEY = process.env.LLM_API_KEY || "";
const MODEL = process.env.LLM_MODEL || "auto";

/**
 * Call the LLM and return parsed JSON.
 *
 * @param {object} opts
 * @param {string} opts.system      — system prompt
 * @param {string} opts.user        — user prompt
 * @param {Array}  [opts.images]    — array of { url, description } or base64
 * @param {object} [opts.jsonSchema]— JSON schema the model must conform to
 * @param {string} [opts.mockKey]   — when MOCK=1, which canned file to load
 * @returns {Promise<object>} parsed JSON response
 */
export async function callModel({
  system,
  user,
  images,
  jsonSchema,
  mockKey,
}) {
  if (MOCK) {
    return loadMock(mockKey);
  }

  if (!BASE_URL || !API_KEY) {
    throw new Error(
      "LLM not configured: set LLM_BASE_URL, LLM_API_KEY, LLM_MODEL in .env " +
        "(or use MOCK=1 for demo mode).",
    );
  }

  const messages = [
    { role: "system", content: system },
    {
      role: "user",
      content: buildUserContent(user, images),
    },
  ];

  const body = {
    model: MODEL,
    messages,
    temperature: 0,
  };

  if (jsonSchema) {
    // OpenAI-compatible structured outputs
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: "response",
        schema: jsonSchema,
        strict: true,
      },
    };
  } else {
    body.response_format = { type: "json_object" };
  }

  const resp = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`LLM API error ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("LLM returned empty content");
  }

  return JSON.parse(content);
}

// ── MOCK helpers ────────────────────────────────────────────────────────────

function loadMock(mockKey) {
  if (!mockKey) {
    throw new Error("MOCK=1 but no mockKey provided to callModel");
  }
  const filePath = join(MOCK_DIR, `${mockKey}.json`);
  const raw = readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function buildUserContent(user, images) {
  if (!images || images.length === 0) {
    return user;
  }
  // OpenAI vision content format: text + image_url parts.
  const content = [{ type: "text", text: user }];
  for (const img of images) {
    content.push({
      type: "image_url",
      image_url: {
        url: img.url ?? img.base64 ?? img.description,
        detail: "high",
      },
    });
  }
  return content;
}

export const isMock = MOCK;
