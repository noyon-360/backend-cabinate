// Rule-based kitchen layout ("rules-v1").
//
// Places the selected cabinets along the RoomSpec walls and reports what it
// could not do. Deterministic: same room + products → same layout. Later the
// LLM will only propose an order; this engine still does the mm maths and
// the checks.
//
// Walls run in order A → B → C. Cabinets at the end of one wall turn the
// corner, so each later wall starts after the previous run's depth.
//
// Tiers:
//   base  floor units under the worktop
//   wall  units hung above the worktop
//   tall  floor-to-top units; they block both base and wall space
//
// The Flutter app mirrors roomSpans/conflicts in layout_model.dart so it can
// refuse impossible moves before saving. Keep them in sync.

export const ENGINE = "rules-v1";

const DEFAULT_DEPTH = { base: 600, wall: 350, tall: 600 };
const BASE_HEIGHT_MM = 900; // a window sill below this blocks base units too
const MAX_FILLER_MM = 150; // gaps up to this get a filler panel
const ALL_PLACED = "All selected products placed";

const TIER_OF = { Base: "base", Wall: "wall", Tall: "tall" };

const isSinkBase = (u) =>
  u.tier === "base" &&
  (/^SB/i.test(u.sku) || /sink/i.test(u.name ?? ""));

const overlaps = ([a1, b1], [a2, b2]) => a1 < b2 && a2 < b1;

// Two cabinets compete for the same space when they share a tier, or one is
// tall (it fills the base and wall space in front of it).
const conflicts = (a, b) =>
  a.tier === b.tier || a.tier === "tall" || b.tier === "tall";

const spanOf = (i) => [i.offsetMm, i.offsetMm + i.widthMm];

/**
 * Space each tier can't use on each wall: the corner taken by the previous
 * wall's run, doors, windows and the hob. Corner depth follows the deepest
 * cabinet of that tier in [units].
 * @returns [{ base: [[start, end]], wall: [...], tall: [...] }] per wall
 */
const roomSpans = (room, units) => {
  const depthOf = (tier) =>
    Math.max(
      DEFAULT_DEPTH[tier],
      ...units.filter((u) => u.tier === tier).map((u) => u.depthMm)
    );

  return room.walls.map((wall, i) => {
    const spans = { base: [], wall: [], tall: [] };
    if (i > 0) {
      spans.base.push([0, depthOf("base")]);
      spans.tall.push([0, depthOf("base")]);
      spans.wall.push([0, depthOf("wall")]);
    }
    for (const o of wall.openings) {
      const span = [o.offsetMm, o.offsetMm + o.widthMm];
      if (o.type === "door") {
        spans.base.push(span);
        spans.wall.push(span);
        spans.tall.push(span);
      } else if (o.type === "window") {
        spans.wall.push(span);
        spans.tall.push(span);
        if ((o.sillMm ?? 0) < BASE_HEIGHT_MM) spans.base.push(span);
      } else if (o.type === "hob") {
        spans.wall.push(span); // keep space for the extractor hood
        spans.tall.push(span);
      }
    }
    return spans;
  });
};

// Gaps between [spans] along a wall of [length], left to right.
const freeBetween = (spans, length) => {
  const free = [];
  let cursor = 0;
  for (const [a, b] of [...spans].sort((x, y) => x[0] - y[0])) {
    if (a > cursor) free.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < length) free.push([cursor, length]);
  return free;
};

// Filler panels for gaps up to MAX_FILLER_MM that touch a placed cabinet.
const computeFillers = (room, items) => {
  const spans = roomSpans(room, items);
  const fillers = [];
  room.walls.forEach((wall, w) => {
    for (const tier of ["base", "wall"]) {
      const placed = items.filter(
        (i) => i.wallId === wall.id && conflicts(i, { tier })
      );
      if (placed.length === 0) continue;
      const taken = [...spans[w][tier], ...placed.map(spanOf)];
      for (const [a, b] of freeBetween(taken, wall.lengthMm)) {
        const touchesUnit = placed.some(
          (i) => i.offsetMm + i.widthMm === a || i.offsetMm === b
        );
        if (touchesUnit && b - a <= MAX_FILLER_MM) {
          fillers.push({ wallId: wall.id, tier, offsetMm: a, widthMm: b - a });
        }
      }
    }
  });
  return fillers;
};

// Where a sink base should go: sink points first, then windows.
const sinkTargets = (room) => {
  const targets = [];
  for (const kind of ["sink", "window"]) {
    room.walls.forEach((wall, w) => {
      for (const o of wall.openings) {
        if (o.type === kind) {
          targets.push({ w, wallId: wall.id, centre: o.offsetMm + o.widthMm / 2, kind });
        }
      }
    });
  }
  return targets;
};

const computeChecks = (room, items, allPlaced) => {
  const checks = [
    { label: ALL_PLACED, passed: allPlaced },
    // Generation and checkLayout both refuse anything that breaks this.
    { label: "Doors and corners kept clear", passed: true },
  ];

  const sink = items.find(isSinkBase);
  if (sink) {
    const hit = sinkTargets(room).find(
      (t) =>
        t.wallId === sink.wallId &&
        t.centre >= sink.offsetMm &&
        t.centre <= sink.offsetMm + sink.widthMm
    );
    checks.push(
      hit
        ? { label: `Sink base under the ${hit.kind === "sink" ? "sink point" : "window"}`, passed: true }
        : { label: "Sink base under the window or sink point", passed: false }
    );
  }

  const hobsClear = room.walls.every((wall) =>
    wall.openings
      .filter((o) => o.type === "hob")
      .every((o) =>
        items
          .filter((i) => i.wallId === wall.id && i.tier !== "base")
          .every((i) => !overlaps(spanOf(i), [o.offsetMm, o.offsetMm + o.widthMm]))
      )
  );
  checks.push({ label: "No wall units over the hob", passed: hobsClear });

  return checks;
};

const byPosition = (a, b) =>
  a.wallId === b.wallId ? a.offsetMm - b.offsetMm : a.wallId.localeCompare(b.wallId);

/**
 * @param room     RoomSpec (validated by utils/roomSpec.js)
 * @param products [{ product: populated Product doc, quantity }]
 * @returns { engine, items, fillers, warnings, checks }
 */
export const generateLayout = (room, products) => {
  const warnings = [];

  // One entry per physical cabinet.
  const units = [];
  for (const { product, quantity } of products) {
    const tier = TIER_OF[product.category];
    if (!tier) {
      warnings.push(`${product.sku}: ${product.category} units are not placed on walls`);
      continue;
    }
    for (let i = 0; i < quantity; i++) {
      units.push({
        productId: String(product._id),
        sku: product.sku,
        name: product.name,
        tier,
        widthMm: Math.round(product.width),
        heightMm: Math.round(product.height),
        depthMm: Math.round(product.depth),
      });
    }
  }

  // Grows as cabinets are placed.
  const blocked = roomSpans(room, units);
  const items = [];
  const placedUnits = new Set();

  const fits = (wallIndex, tier, start, width) => {
    if (start < 0 || start + width > room.walls[wallIndex].lengthMm) return false;
    return blocked[wallIndex][tier].every((s) => !overlaps(s, [start, start + width]));
  };

  const place = (unit, wallIndex, offsetMm) => {
    items.push({ ...unit, wallId: room.walls[wallIndex].id, offsetMm });
    placedUnits.add(unit);
    const tiers = unit.tier === "tall" ? ["base", "wall", "tall"] : [unit.tier];
    for (const t of tiers) blocked[wallIndex][t].push([offsetMm, offsetMm + unit.widthMm]);
  };

  const freeSpans = (w, tier) =>
    freeBetween(blocked[w][tier], room.walls[w].lengthMm);

  const unplaced = [];
  const lastWall = room.walls.length - 1;

  // 1. Tall units: packed from the far end of the last wall backwards,
  //    then any other wall end that has room.
  for (const unit of units.filter((u) => u.tier === "tall")) {
    let done = false;
    for (let w = lastWall; w >= 0 && !done; w--) {
      for (const [a, b] of freeSpans(w, "tall").reverse()) {
        if (b - a >= unit.widthMm) {
          place(unit, w, b - unit.widthMm);
          done = true;
          break;
        }
      }
    }
    if (!done) unplaced.push(unit);
  }

  // 2. Sink base: centred on the sink point, else under a window.
  const sinkUnit = units.find(isSinkBase);
  if (sinkUnit) {
    const targets = sinkTargets(room);
    for (const t of targets) {
      const offset = Math.round(t.centre - sinkUnit.widthMm / 2);
      if (fits(t.w, "base", offset, sinkUnit.widthMm)) {
        place(sinkUnit, t.w, offset);
        break;
      }
    }
    if (targets.length === 0) {
      warnings.push("Mark the sink or a window on a wall to position the sink base");
    }
  }

  // 3. Remaining base and wall units: widest first, into the first free
  //    span that fits (walls A → C, left to right).
  for (const tier of ["base", "wall"]) {
    const rest = units
      .filter((u) => u.tier === tier && !placedUnits.has(u))
      .sort((a, b) => b.widthMm - a.widthMm);

    for (const unit of rest) {
      let done = false;
      for (let w = 0; w <= lastWall && !done; w++) {
        for (const [a, b] of freeSpans(w, tier)) {
          if (b - a >= unit.widthMm) {
            place(unit, w, a);
            done = true;
            break;
          }
        }
      }
      if (!done) unplaced.push(unit);
    }
  }

  for (const u of unplaced) {
    warnings.push(`${u.sku} (${u.widthMm} mm) did not fit and was left out`);
  }

  items.sort(byPosition);

  return {
    engine: ENGINE,
    items,
    fillers: computeFillers(room, items),
    warnings,
    checks: computeChecks(room, items, unplaced.length === 0),
  };
};

/**
 * Re-checks a layout the user rearranged in the Design step.
 *
 * Only positions (wallId, offsetMm) are taken from [edited]; every other
 * field comes from [base], the generated layout, and the cabinets must be
 * exactly the same ones. Fillers and checks are rebuilt.
 *
 * @returns { layout } when valid, or { problems: [string] } when not
 */
export const checkLayout = (room, base, edited) => {
  const key = (i) =>
    [i.productId, i.sku, i.tier, i.widthMm, i.heightMm, i.depthMm].join("|");

  if (!Array.isArray(edited) || edited.length !== base.items.length) {
    return { problems: ["The layout must contain the generated cabinets"] };
  }

  // Match each edited cabinet to an unused generated one.
  const pool = new Map();
  for (const item of base.items) {
    pool.set(key(item), [...(pool.get(key(item)) ?? []), item]);
  }
  const items = [];
  for (const e of edited) {
    const match = pool.get(key(e ?? {}))?.pop();
    if (!match) {
      return { problems: ["The layout must contain the generated cabinets"] };
    }
    items.push({ ...match, wallId: e.wallId, offsetMm: e.offsetMm });
  }

  const problems = [];
  const spans = roomSpans(room, items);
  items.forEach((item, n) => {
    const w = room.walls.findIndex((wall) => wall.id === item.wallId);
    if (w < 0 || !Number.isInteger(item.offsetMm)) {
      problems.push(`${item.sku}: invalid position`);
      return;
    }
    const span = spanOf(item);
    if (span[0] < 0 || span[1] > room.walls[w].lengthMm) {
      problems.push(`${item.sku} runs past the end of the wall`);
    } else if (spans[w][item.tier].some((s) => overlaps(s, span))) {
      problems.push(`${item.sku} blocks a door, window, hob or corner`);
    }
    for (const other of items.slice(n + 1)) {
      if (other.wallId === item.wallId && conflicts(item, other) && overlaps(span, spanOf(other))) {
        problems.push(`${item.sku} overlaps ${other.sku}`);
      }
    }
  });
  if (problems.length) return { problems };

  items.sort(byPosition);
  const allPlaced = base.checks.find((c) => c.label === ALL_PLACED)?.passed ?? true;

  return {
    layout: {
      engine: base.engine,
      items,
      fillers: computeFillers(room, items),
      warnings: base.warnings, // unplaced / island notes still apply
      checks: computeChecks(room, items, allPlaced),
    },
  };
};
