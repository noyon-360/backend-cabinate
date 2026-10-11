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

// Where a planned unit should sit on its wall.
export const ANCHORS = ["start", "end", "sink", "hob", "window"];

const DEFAULT_DEPTH = { base: 600, wall: 350, tall: 600 };
const BASE_HEIGHT_MM = 900; // a window sill below this blocks base units too
const MAX_FILLER_MM = 150; // gaps up to this get a filler panel
const TALL_HOB_GAP_MM = 300; // heat clearance between a hob and a tall unit
const ALL_PLACED = "All selected products placed";

const TIER_OF = { Base: "base", Wall: "wall", Tall: "tall" };

const isSinkBase = (u) =>
  u.tier === "base" &&
  (/^SB/i.test(u.sku) || /sink/i.test(u.name ?? ""));

const isDrawerUnit = (u) =>
  u.tier === "base" &&
  (/^DU/i.test(u.sku) || /drawer/i.test(u.name ?? ""));

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
export const roomSpans = (room, units) => {
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
        // Heat clearance: tall units stay this far from the hob.
        spans.tall.push([span[0] - TALL_HOB_GAP_MM, span[1] + TALL_HOB_GAP_MM]);
      }
    }
    return spans;
  });
};

// Gaps between [spans] along a wall of [length], left to right.
export const freeBetween = (spans, length) => {
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

  const hobs = room.walls.flatMap((wall) =>
    wall.openings
      .filter((o) => o.type === "hob")
      .map((o) => ({ wallId: wall.id, from: o.offsetMm, to: o.offsetMm + o.widthMm }))
  );
  // A hob sits on a worktop, so a base unit must be under its centre.
  if (hobs.length) {
    const supported = hobs.every((h) => {
      const centre = (h.from + h.to) / 2;
      return items.some(
        (b) =>
          b.tier === "base" &&
          b.wallId === h.wallId &&
          b.offsetMm <= centre &&
          centre <= b.offsetMm + b.widthMm
      );
    });
    checks.push({ label: "Base unit under the hob", passed: supported });
  }

  const talls = items.filter((i) => i.tier === "tall");
  if (hobs.length && talls.length) {
    const clear = talls.every((t) =>
      hobs.every(
        (h) =>
          h.wallId !== t.wallId ||
          t.offsetMm >= h.to + TALL_HOB_GAP_MM ||
          t.offsetMm + t.widthMm <= h.from - TALL_HOB_GAP_MM
      )
    );
    checks.push({ label: "Tall units kept clear of the hob", passed: clear });
  }

  // A hung unit needs a worktop under its centre.
  const hung = items.filter((i) => i.tier === "wall");
  if (hung.length) {
    const supported = hung.every((w) => {
      const centre = w.offsetMm + w.widthMm / 2;
      return items.some(
        (b) =>
          b.tier === "base" &&
          b.wallId === w.wallId &&
          b.offsetMm <= centre &&
          centre <= b.offsetMm + b.widthMm
      );
    });
    checks.push({ label: "Wall units above a worktop", passed: supported });
  }

  return checks;
};

const byPosition = (a, b) =>
  a.wallId === b.wallId ? a.offsetMm - b.offsetMm : a.wallId.localeCompare(b.wallId);

/**
 * One entry per physical cabinet, each with a stable id ("U1", "U2", …)
 * that a plan refers to. Same products → same ids.
 * @returns { units, warnings }
 */
export const expandUnits = (products) => {
  const warnings = [];
  const units = [];
  for (const { product, quantity } of products) {
    const tier = TIER_OF[product.category];
    if (!tier) {
      warnings.push(`${product.sku}: ${product.category} units are not placed on walls`);
      continue;
    }
    for (let i = 0; i < quantity; i++) {
      units.push({
        id: `U${units.length + 1}`,
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
  return { units, warnings };
};

/**
 * @param room     RoomSpec (validated by utils/roomSpec.js)
 * @param products [{ product: populated Product doc, quantity }]
 * @param plan     optional [{ unit: "U1", wall: "w2", near: "hob" }] from
 *                 utils/llmLayout.js. Each planned unit goes on its wall as
 *                 close to its anchor as space allows (see ANCHORS), in
 *                 plan order; the sink base still goes to the sink
 *                 point/window, and anything left out is placed by the rules.
 * @param engine   name reported in the result
 * @returns { engine, items, fillers, warnings, checks }
 */
export const generateLayout = (room, products, { plan = null, engine = ENGINE } = {}) => {
  const { units, warnings } = expandUnits(products);

  // unit id → { w: wall index, near: anchor, rank: position in the plan }
  const planned = new Map();
  (plan ?? []).forEach(({ unit, wall, near }, rank) => {
    const w = room.walls.findIndex((x) => x.id === wall);
    if (w >= 0 && !planned.has(unit)) {
      planned.set(unit, { w, near: ANCHORS.includes(near) ? near : "start", rank });
    }
  });

  // Grows as cabinets are placed.
  const blocked = roomSpans(room, units);
  const items = [];
  const placedUnits = new Set();

  const fits = (wallIndex, tier, start, width) => {
    if (start < 0 || start + width > room.walls[wallIndex].lengthMm) return false;
    return blocked[wallIndex][tier].every((s) => !overlaps(s, [start, start + width]));
  };

  // unit → { item, w, tiers, span, anchor } so a placement can be undone.
  // [anchor] is the x the unit must stay over (sink point, window, hob).
  const records = new Map();

  const place = (unit, wallIndex, offsetMm, anchor = null) => {
    const { id, ...rest } = unit; // plan ids stay internal
    const item = { ...rest, wallId: room.walls[wallIndex].id, offsetMm };
    items.push(item);
    placedUnits.add(unit);
    const span = [offsetMm, offsetMm + unit.widthMm];
    const tiers = unit.tier === "tall" ? ["base", "wall", "tall"] : [unit.tier];
    for (const t of tiers) blocked[wallIndex][t].push(span);
    records.set(unit, { item, w: wallIndex, tiers, span, anchor });
  };

  const unplace = (unit) => {
    const r = records.get(unit);
    items.splice(items.indexOf(r.item), 1);
    placedUnits.delete(unit);
    for (const t of r.tiers) {
      const spans = blocked[r.w][t];
      spans.splice(spans.indexOf(r.span), 1);
    }
    records.delete(unit);
  };

  const freeSpans = (w, tier) =>
    freeBetween(blocked[w][tier], room.walls[w].lengthMm);

  // Where [unit] may go on wall w, best first. Wall units try the parts of
  // the free space that sit above a placed base unit (a worktop) before
  // anything else; base units are always placed before wall units.
  const candidateSpans = (unit, w) => {
    const free = freeSpans(w, unit.tier);
    if (unit.tier !== "wall") return [free];
    const worktop = items
      .filter((i) => i.tier === "base" && i.wallId === room.walls[w].id)
      .map(spanOf);
    const above = free.flatMap(([a, b]) =>
      worktop
        .map(([c, d]) => [Math.max(a, c), Math.min(b, d)])
        .filter(([x, y]) => y > x)
    );
    // Merge touching pieces (neighbouring base units) into one span.
    const merged = [];
    for (const [x, y] of above.sort((p, q) => p[0] - q[0])) {
      const last = merged.at(-1);
      if (last && x <= last[1]) last[1] = Math.max(last[1], y);
      else merged.push([x, y]);
    }
    return [merged, free];
  };

  const unplaced = [];
  const lastWall = room.walls.length - 1;

  // First free span on wall w (left to right) that fits; places and
  // returns true, or returns false.
  // [group]: only that preference level of candidateSpans (0 = best).
  const groupsOf = (unit, w, group) => {
    const all = candidateSpans(unit, w);
    return group === undefined ? all : all.slice(group, group + 1);
  };
  const groupCount = (unit) => (unit.tier === "wall" ? 2 : 1);

  const placeFirstFit = (unit, w, group) => {
    for (const spans of groupsOf(unit, w, group)) {
      for (const [a, b] of spans) {
        if (b - a >= unit.widthMm) {
          place(unit, w, a);
          return true;
        }
      }
    }
    return false;
  };

  // Places [unit] on wall w as close to [near] as the free space allows.
  // Returns false if it doesn't fit on that wall at all.
  const placeNear = (unit, w, near, group) => {
    const length = room.walls[w].lengthMm;
    const opening = room.walls[w].openings.find((o) => o.type === near);
    // Target x for the unit's centre; an anchor missing on this wall
    // means "start".
    const target = opening
      ? opening.offsetMm + opening.widthMm / 2
      : near === "end"
        ? length
        : 0;

    for (const spans of groupsOf(unit, w, group)) {
      let best = null;
      for (const [a, b] of spans) {
        if (b - a < unit.widthMm) continue;
        const offset = Math.round(
          Math.min(Math.max(target - unit.widthMm / 2, a), b - unit.widthMm)
        );
        const distance = Math.abs(offset + unit.widthMm / 2 - target);
        if (!best || distance < best.distance) best = { offset, distance };
      }
      if (best) {
        place(unit, w, best.offset);
        return true;
      }
    }
    return false;
  };

  // Planned units: their wall first, then the others left to right. Wall
  // units look for a worktop below on every wall before going without.
  const placePlanned = (unit) => {
    const p = planned.get(unit.id);
    if (!p) return false;
    for (let g = 0; g < groupCount(unit); g++) {
      if (placeNear(unit, p.w, p.near, g)) return true;
      if (room.walls.some((_, w) => w !== p.w && placeFirstFit(unit, w, g))) return true;
    }
    return false;
  };

  const placeAnywhere = (unit) => {
    for (let g = 0; g < groupCount(unit); g++) {
      if (room.walls.some((_, w) => placeFirstFit(unit, w, g))) return true;
    }
    return false;
  };

  // Slides each base unit on each wall as far left as it can go (staying
  // over its anchor, if any) so scattered small gaps merge into one.
  const compactBase = () => {
    room.walls.forEach((_, w) => {
      const onWall = units
        .filter((u) => u.tier === "base" && records.get(u)?.w === w)
        .sort((a, b) => records.get(a).item.offsetMm - records.get(b).item.offsetMm);
      for (const u of onWall) {
        const { item, anchor } = records.get(u);
        const was = item.offsetMm;
        unplace(u);
        let at = null;
        for (const [a, b] of freeSpans(w, "base")) {
          let lo = a;
          let hi = b - u.widthMm;
          if (anchor !== null) {
            lo = Math.max(lo, Math.ceil(anchor - u.widthMm));
            hi = Math.min(hi, Math.floor(anchor));
          }
          if (lo <= hi) {
            at = lo;
            break;
          }
        }
        place(u, w, at ?? was, anchor);
      }
    });
  };

  // 1. Tall units: planned ones at their anchor; otherwise from the far
  //    end of the last wall backwards.
  for (const unit of units.filter((u) => u.tier === "tall")) {
    if (placePlanned(unit)) continue;
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
        place(sinkUnit, t.w, offset, t.centre);
        break;
      }
    }
    if (targets.length === 0) {
      warnings.push("Mark the sink or a window on a wall to position the sink base");
    }
  }

  // 2b. A base unit under each hob: the one the plan anchors to the hob,
  //     else a drawer unit, else the base unit closest to the hob's width.
  room.walls.forEach((wall, w) => {
    for (const hob of wall.openings.filter((o) => o.type === "hob")) {
      const free = units.filter(
        (u) => u.tier === "base" && !placedUnits.has(u) && !isSinkBase(u)
      );
      const pick =
        free.find((u) => planned.get(u.id)?.near === "hob" && planned.get(u.id).w === w) ??
        free.find(isDrawerUnit) ??
        [...free].sort(
          (a, b) => Math.abs(a.widthMm - hob.widthMm) - Math.abs(b.widthMm - hob.widthMm)
        )[0];
      if (!pick) continue;
      const centre = hob.offsetMm + hob.widthMm / 2;
      const offset = Math.round(centre - pick.widthMm / 2);
      // Centred if possible, else anywhere still under the hob's centre.
      const options = [offset];
      for (let o = Math.ceil(centre - pick.widthMm); o <= Math.floor(centre); o += 25) {
        options.push(o);
      }
      const at = options.find((o) => fits(w, "base", o, pick.widthMm));
      if (at !== undefined) place(pick, w, at, centre);
    }
  });

  // 3. Remaining base, then wall units. Planned ones first, in plan
  //    order, at their anchors; then the rest widest first into the first
  //    free span that fits (walls A → C, left to right).
  for (const tier of ["base", "wall"]) {
    const rank = (u) => planned.get(u.id)?.rank ?? Infinity;
    const rest = units
      .filter((u) => u.tier === tier && !placedUnits.has(u))
      .sort((a, b) => rank(a) - rank(b) || b.widthMm - a.widthMm);

    const missed = rest.filter((unit) => !placePlanned(unit) && !placeAnywhere(unit));

    // Base units that didn't fit: close up the gaps and try once more,
    // before wall units are hung over the final base positions.
    if (tier === "base" && missed.length) {
      compactBase();
      for (const unit of missed) {
        if (!placePlanned(unit) && !placeAnywhere(unit)) unplaced.push(unit);
      }
    } else {
      unplaced.push(...missed);
    }
  }

  for (const u of unplaced) {
    warnings.push(`${u.sku} (${u.widthMm} mm) did not fit and was left out`);
  }

  items.sort(byPosition);

  return {
    engine,
    items,
    fillers: computeFillers(room, items),
    warnings,
    checks: computeChecks(room, items, unplaced.length === 0),
  };
};

/** Higher is better: fewer failed checks, then more cabinets placed. */
export const layoutScore = (layout) => [
  -layout.checks.filter((c) => !c.passed).length,
  layout.items.length,
];

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
