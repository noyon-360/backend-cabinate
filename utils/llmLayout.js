import { roomSpans, freeBetween, ANCHORS } from "./layoutEngine.js";

// Asks a local LLM (Ollama) where each cabinet should go: which wall, and
// what it should sit next to (an anchor). It never produces measurements;
// the layout engine places each unit as close to its anchor as space
// allows, then checks the result.
//
// Settings (.env), so moving to the VPS is a config change:
//   LAYOUT_AI=off               disable and always use the rules
//   OLLAMA_URL                  default http://localhost:11434
//   LAYOUT_MODEL                default qwen3:8b
//   LAYOUT_AI_TIMEOUT_MS        default 45000 (the app waits 60 s)
//   LAYOUT_AI_THINK=on          let qwen3 reason first (slower)

export const aiSettings = () => ({
  enabled: process.env.LAYOUT_AI !== "off",
  url: process.env.OLLAMA_URL ?? "http://localhost:11434",
  model: process.env.LAYOUT_MODEL ?? "qwen3:8b",
  timeoutMs: Number(process.env.LAYOUT_AI_TIMEOUT_MS ?? 45000),
  think: process.env.LAYOUT_AI_THINK === "on",
});

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

/**
 * @param room     RoomSpec
 * @param units    from expandUnits(); each has an id
 * @param feedback optional { plan, failed: [check labels] } from a previous
 *                 attempt, so the model can correct it
 * @param deadline ms timestamp to give up at (shared across attempts)
 * @returns { plan: [{ unit, wall, near }], ms } — throws on failure/timeout
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

  const started = Date.now();
  const res = await fetch(`${settings.url}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(
      Math.max(1, (deadline ?? started + settings.timeoutMs) - Date.now())
    ),
    body: JSON.stringify({
      model: settings.model,
      stream: false,
      think: settings.think,
      format,
      keep_alive: "30m", // stay loaded between jobs
      options: { temperature: 0.2 },
      messages: [
        { role: "system", content: SYSTEM },
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
      ],
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);

  const body = await res.json();
  const placements = JSON.parse(body.message?.content ?? "{}").placements;
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

  return { plan, ms: Date.now() - started };
};
