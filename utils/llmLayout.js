import { GoogleGenAI } from "@google/genai";
import { roomSpans, freeBetween, ANCHORS } from "./layoutEngine.js";

// Asks an LLM (local Ollama, or the Gemini API) where each cabinet should
// go: which wall, and what it should sit next to (an anchor). It never
// produces measurements; the layout engine places each unit as close to
// its anchor as space allows, then checks the result.
//
// Settings (.env), so switching provider or server is a config change:
//   LAYOUT_AI=off               disable and always use the rules
//   LAYOUT_PROVIDER             "ollama" (default) or "gemini"
//   LAYOUT_MODEL                default qwen3:8b (ollama),
//                               gemini-flash-latest (gemini); a comma list
//                               tries the next model when one fails
//                               (e.g. Gemini's 503 "high demand")
//   OLLAMA_URL                  default http://localhost:11434
//   GEMINI_API_KEY              required for gemini
//   LAYOUT_AI_TIMEOUT_MS        default 45000 (the app waits 60 s)
//   LAYOUT_AI_THINK=on          let qwen3 reason first (slower; ollama only)

export const aiSettings = () => {
  const provider = process.env.LAYOUT_PROVIDER === "gemini" ? "gemini" : "ollama";
  const models = (
    process.env.LAYOUT_MODEL ??
    (provider === "gemini" ? "gemini-flash-latest" : "qwen3:8b")
  )
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return {
    enabled: process.env.LAYOUT_AI !== "off",
    provider,
    url: process.env.OLLAMA_URL ?? "http://localhost:11434",
    model: models[0],
    models,
    timeoutMs: Number(process.env.LAYOUT_AI_TIMEOUT_MS ?? 45000),
    think: process.env.LAYOUT_AI_THINK === "on",
  };
};

let gemini;
const geminiClient = () =>
  (gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));

const SYSTEM = `You plan kitchen cabinet layouts. For every unit, choose the wall it goes on and what it should sit near. Software then places each unit as close to that anchor as space allows, so never output measurements.

Anchors ("near"):
- "start": the left end of the wall. "end": the right end of the wall.
- "sink", "hob", "window": next to (or under) that opening on the same wall. Only use one that exists on the chosen wall.

Rules:
- Include every unit exactly once. Units sharing an anchor are placed in the order you list them, nearest first.
- Per wall, the widths of its base + tall units must not exceed "floorFreeMm", and its wall + tall units must not exceed "wallFreeMm". Use another wall rather than overfilling one.
- The sink base: near "sink" on the wall with the sink point; if there is none, near "window".
- The hob needs a base unit under it: put a drawer unit near "hob"; if there is none, another base unit (not the sink base).
- Drawer units: near "hob"; if there is no hob, near "sink".
- Tall units: near "start" or "end" of a wall that has no hob, or of the far end from the hob. Never near the hob.
- Wall units: on walls that have base units, near the same anchors as those base units, so each hangs above a worktop.
- Other base units: fill the wall around the sink and hob so the worktop runs continuously.`;

/**
 * Loads the model into memory ahead of the first layout (about 6 s on a
 * cold start). Fire and forget; a failure only means the first layout is
 * slower or falls back to the rules.
 */
export const warmUpLayoutModel = async () => {
  const settings = aiSettings();
  if (!settings.enabled) return;
  if (settings.provider === "gemini") {
    // Hosted: nothing to load, just say which model and whether a key is set.
    console.log(
      `[layout] gemini ${settings.model}` +
        (process.env.GEMINI_API_KEY ? "" : " (GEMINI_API_KEY missing)")
    );
    return;
  }
  try {
    const res = await fetch(`${settings.url}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({ model: settings.model, keep_alive: "30m" }),
    });
    console.log(`[layout] ${settings.model} ${res.ok ? "loaded" : `not loaded (${res.status})`}`);
  } catch (err) {
    console.warn(`[layout] ${settings.model} not reachable at ${settings.url}: ${err.message}`);
  }
};

const wallName = (i) => `Wall ${String.fromCharCode(65 + i)}`;

// What the model sees: walls with openings and free space, and the units.
const describe = (room, units) => {
  const spans = roomSpans(room, units);
  const free = (w, tier) =>
    freeBetween(spans[w][tier], room.walls[w].lengthMm).reduce(
      (sum, [a, b]) => sum + (b - a),
      0
    );

  return {
    walls: room.walls.map((wall, w) => ({
      id: wall.id,
      name: wallName(w),
      lengthMm: wall.lengthMm,
      floorFreeMm: free(w, "base"),
      wallFreeMm: free(w, "wall"),
      openings: wall.openings.map((o) => ({
        type: o.type,
        fromMm: o.offsetMm,
        toMm: o.offsetMm + o.widthMm,
      })),
      corner:
        w === 0
          ? null
          : room.shape === "galley"
            ? `no corner: faces ${wallName(w - 1)} across the aisle`
            : `left end meets the right end of ${wallName(w - 1)}`,
    })),
    units: units.map((u) => ({
      id: u.id,
      sku: u.sku,
      name: u.name,
      kind: u.tier,
      widthMm: u.widthMm,
    })),
  };
};

const MODEL_ATTEMPT_MS = 20000;

// "503 UNAVAILABLE" out of Gemini's JSON error body, for one-line logs.
const shortError = (err) => {
  const msg = err?.message ?? String(err);
  const code = msg.match(/"code":\s*(\d+)/)?.[1];
  const status = msg.match(/"status":\s*"(\w+)"/)?.[1];
  return code ? `${code} ${status ?? ""}`.trim() : msg.slice(0, 120);
};

// Each provider takes a model, the conversation and the JSON schema and
// returns the reply text, which should be JSON matching the schema.
const askOllama = async (settings, model, turns, format, signal) => {
  const res = await fetch(`${settings.url}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      model,
      stream: false,
      think: settings.think,
      format,
      keep_alive: "30m", // stay loaded between jobs
      options: { temperature: 0.2 },
      messages: [{ role: "system", content: SYSTEM }, ...turns],
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  return (await res.json()).message?.content;
};

const askGemini = async (settings, model, turns, format, signal) => {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
  const res = await geminiClient().models.generateContent({
    model,
    contents: turns.map((t) => ({
      role: t.role === "assistant" ? "model" : "user",
      parts: [{ text: t.content }],
    })),
    config: {
      systemInstruction: SYSTEM,
      responseMimeType: "application/json",
      responseJsonSchema: format,
      temperature: 0.2,
      abortSignal: signal,
    },
  });
  return res.text;
};

/**
 * @param room     RoomSpec
 * @param units    from expandUnits(); each has an id
 * @param feedback optional { plan, failed: [check labels] } from a previous
 *                 attempt, so the model can correct it
 * @param deadline ms timestamp to give up at (shared across attempts)
 * @returns { plan: [{ unit, wall, near }], ms, model } — throws when every
 *          model failed or time ran out
 */
export const suggestPlan = async (room, units, { feedback, deadline } = {}) => {
  const settings = aiSettings();
  const unitIds = units.map((u) => u.id);
  const wallIds = room.walls.map((w) => w.id);

  // The schema limits ids to real ones, so the model can't invent units.
  const format = {
    type: "object",
    properties: {
      placements: {
        type: "array",
        items: {
          type: "object",
          properties: {
            unit: { type: "string", enum: unitIds },
            wall: { type: "string", enum: wallIds },
            near: { type: "string", enum: ANCHORS },
          },
          required: ["unit", "wall", "near"],
        },
      },
    },
    required: ["placements"],
  };

  // The conversation without the system prompt; on a retry it includes the
  // previous plan and what failed.
  const turns = [
    { role: "user", content: JSON.stringify(describe(room, units)) },
    ...(feedback
      ? [
          {
            role: "assistant",
            content: JSON.stringify({ placements: feedback.plan }),
          },
          {
            role: "user",
            content: `The software placed that plan and these checks failed: ${feedback.failed.join("; ")}. Return a corrected plan for every unit.`,
          },
        ]
      : []),
  ];

  const started = Date.now();
  const end = deadline ?? started + settings.timeoutMs;
  const ask = settings.provider === "gemini" ? askGemini : askOllama;

  // Try each model in turn. An overloaded model can hang rather than fail,
  // so all but the last get at most MODEL_ATTEMPT_MS of the time left.
  let reply, model, lastError;
  for (const [i, m] of settings.models.entries()) {
    const left = end - Date.now();
    if (left <= 0) break;
    const isLast = i === settings.models.length - 1;
    try {
      const signal = AbortSignal.timeout(isLast ? left : Math.min(left, MODEL_ATTEMPT_MS));
      reply = await ask(settings, m, turns, format, signal);
      model = m;
      break;
    } catch (err) {
      lastError = err;
      if (!isLast) console.warn(`[layout] ${m} failed, trying the next model: ${shortError(err)}`);
    }
  }
  if (!model) throw lastError ?? new Error("Out of time before any model answered");

  const placements = JSON.parse(reply || "{}").placements;
  if (!Array.isArray(placements)) throw new Error("No placements in reply");

  // Keep the first valid mention of each unit; the engine places any the
  // model skipped.
  const seen = new Set();
  const plan = placements.filter(
    (p) =>
      unitIds.includes(p?.unit) &&
      wallIds.includes(p?.wall) &&
      !seen.has(p.unit) &&
      seen.add(p.unit)
  );
  if (plan.length === 0) throw new Error("Plan placed no units");

  return { plan, ms: Date.now() - started, model };
};
