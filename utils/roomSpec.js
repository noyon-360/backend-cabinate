import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import {
  ROOM_SHAPES,
  ROOM_SOURCES,
  OPENING_TYPES,
} from "../model/job.model.js";

// Keep these in sync with RoomSpec.validate() in the Flutter app.
const WALLS_PER_SHAPE = { straight: 1, L: 2, U: 3, galley: 2 };
const WALL_MIN_MM = 300;
const WALL_MAX_MM = 20000;
const CEILING_MIN_MM = 1800;
const CEILING_MAX_MM = 5000;
const OPENING_MIN_MM = 50;
const CORNER_MIN_DEG = 45;
const CORNER_MAX_DEG = 135;

const isMm = (v) => Number.isInteger(v) && v >= 0;
const isCeiling = (v) => isMm(v) && v >= CEILING_MIN_MM && v <= CEILING_MAX_MM;
const letter = (i) => String.fromCharCode(65 + i);

/**
 * Validates a RoomSpec from the request body and returns a clean copy
 * (unknown keys dropped). Throws 400 with every problem found.
 */
export const parseRoomSpec = (room) => {
  if (!room || typeof room !== "object") {
    throw new AppError(httpStatus.BAD_REQUEST, "room is required");
  }

  const errors = [];
  const { shape, ceilingHeightMm, source, walls, cornerAnglesDeg = null } = room;

  if (!ROOM_SHAPES.includes(shape)) {
    errors.push(`shape must be one of ${ROOM_SHAPES.join(", ")}`);
  }
  if (!ROOM_SOURCES.includes(source)) {
    errors.push(`source must be one of ${ROOM_SOURCES.join(", ")}`);
  }
  if (
    !isMm(ceilingHeightMm) ||
    ceilingHeightMm < CEILING_MIN_MM ||
    ceilingHeightMm > CEILING_MAX_MM
  ) {
    errors.push(
      `Ceiling height must be ${CEILING_MIN_MM}–${CEILING_MAX_MM} mm`
    );
  }

  if (!Array.isArray(walls)) {
    errors.push("walls must be a list");
  } else if (WALLS_PER_SHAPE[shape] && walls.length !== WALLS_PER_SHAPE[shape]) {
    errors.push(`A ${shape} kitchen needs ${WALLS_PER_SHAPE[shape]} wall(s)`);
  }

  if (cornerAnglesDeg !== null) {
    const corners = Array.isArray(walls) ? walls.length - 1 : 0;
    if (shape === "galley") {
      errors.push("A galley kitchen has no corners");
    } else if (!Array.isArray(cornerAnglesDeg) || cornerAnglesDeg.length !== corners) {
      errors.push(`Need one corner angle per corner (${corners})`);
    } else {
      cornerAnglesDeg.forEach((deg, i) => {
        if (!Number.isFinite(deg) || deg < CORNER_MIN_DEG || deg > CORNER_MAX_DEG) {
          errors.push(
            `Corner ${letter(i)}/${letter(i + 1)}: angle must be ${CORNER_MIN_DEG}–${CORNER_MAX_DEG}°`
          );
        }
      });
    }
  }

  const cleanWalls = (Array.isArray(walls) ? walls : []).map((wall, i) => {
    const name = `Wall ${letter(i)}`;
    const { id, lengthMm, openings = [], heightMm = null, heightEndMm = null } = wall ?? {};

    if (typeof id !== "string" || !id) errors.push(`${name}: id is required`);
    if (!isMm(lengthMm) || lengthMm < WALL_MIN_MM || lengthMm > WALL_MAX_MM) {
      errors.push(`${name}: length must be ${WALL_MIN_MM}–${WALL_MAX_MM} mm`);
    }
    if ([heightMm, heightEndMm].some((h) => h !== null && !isCeiling(h))) {
      errors.push(`${name}: ceiling height must be ${CEILING_MIN_MM}–${CEILING_MAX_MM} mm`);
    }
    // Lowest ceiling along this wall (a slope counts at its low end).
    const start = heightMm ?? ceilingHeightMm;
    const ceiling = Math.min(start, heightEndMm ?? start);

    if (!Array.isArray(openings)) {
      errors.push(`${name}: openings must be a list`);
      return { id, lengthMm, openings: [], heightMm, heightEndMm };
    }

    const cleanOpenings = openings.map((o, j) => {
      const label = `${name}, ${o?.type ?? "opening"} ${j + 1}`;
      const { type, offsetMm, widthMm, sillMm = null, heightMm = null } = o ?? {};

      if (!OPENING_TYPES.includes(type)) {
        errors.push(`${label}: type must be one of ${OPENING_TYPES.join(", ")}`);
      }
      if (!isMm(offsetMm)) errors.push(`${label}: offset must be whole mm`);
      if (!isMm(widthMm) || widthMm < OPENING_MIN_MM) {
        errors.push(`${label}: width must be at least ${OPENING_MIN_MM} mm`);
      }
      if (isMm(offsetMm) && isMm(widthMm) && isMm(lengthMm)) {
        if (offsetMm + widthMm > lengthMm) {
          errors.push(`${label}: runs past the end of the wall`);
        }
      }
      if (sillMm !== null) {
        if (type !== "window") errors.push(`${label}: only windows have a sill`);
        else if (!isMm(sillMm) || (isMm(ceiling) && sillMm >= ceiling)) {
          errors.push(`${label}: sill must be below the ceiling`);
        }
      }
      if (heightMm !== null) {
        if (type !== "window" && type !== "door") {
          errors.push(`${label}: only windows and doors have a height`);
        } else if (!isMm(heightMm) || heightMm < OPENING_MIN_MM) {
          errors.push(`${label}: height must be at least ${OPENING_MIN_MM} mm`);
        } else {
          const bottom = type === "window" && isMm(sillMm) ? sillMm : 0;
          if (isMm(ceiling) && bottom + heightMm > ceiling) {
            errors.push(`${label}: top must be below the ceiling`);
          }
        }
      }

      return { type, offsetMm, widthMm, sillMm, heightMm };
    });

    return { id, lengthMm, openings: cleanOpenings, heightMm, heightEndMm };
  });

  if (errors.length) {
    throw new AppError(httpStatus.BAD_REQUEST, errors.join("; "));
  }

  const clean = { shape, ceilingHeightMm, source, walls: cleanWalls };
  if (cornerAnglesDeg !== null) clean.cornerAnglesDeg = cornerAnglesDeg;
  return clean;
};
