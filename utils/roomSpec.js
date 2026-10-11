import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import {
  ROOM_SHAPES,
  ROOM_SOURCES,
  OPENING_TYPES,
} from "../model/job.model.js";

// Keep these in sync with RoomSpec.validate() in the Flutter app.
const WALLS_PER_SHAPE = { straight: 1, L: 2, U: 3 };
const WALL_MIN_MM = 300;
const WALL_MAX_MM = 20000;
const CEILING_MIN_MM = 1800;
const CEILING_MAX_MM = 5000;
const OPENING_MIN_MM = 50;

const isMm = (v) => Number.isInteger(v) && v >= 0;

/**
 * Validates a RoomSpec from the request body and returns a clean copy
 * (unknown keys dropped). Throws 400 with every problem found.
 */
export const parseRoomSpec = (room) => {
  if (!room || typeof room !== "object") {
    throw new AppError(httpStatus.BAD_REQUEST, "room is required");
  }

  const errors = [];
  const { shape, ceilingHeightMm, source, walls } = room;

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

  const cleanWalls = (Array.isArray(walls) ? walls : []).map((wall, i) => {
    const name = `Wall ${String.fromCharCode(65 + i)}`;
    const { id, lengthMm, openings = [] } = wall ?? {};

    if (typeof id !== "string" || !id) errors.push(`${name}: id is required`);
    if (!isMm(lengthMm) || lengthMm < WALL_MIN_MM || lengthMm > WALL_MAX_MM) {
      errors.push(`${name}: length must be ${WALL_MIN_MM}–${WALL_MAX_MM} mm`);
    }
    if (!Array.isArray(openings)) {
      errors.push(`${name}: openings must be a list`);
      return { id, lengthMm, openings: [] };
    }

    const cleanOpenings = openings.map((o, j) => {
      const label = `${name}, ${o?.type ?? "opening"} ${j + 1}`;
      const { type, offsetMm, widthMm, sillMm = null } = o ?? {};

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
        else if (!isMm(sillMm) || (isMm(ceilingHeightMm) && sillMm >= ceilingHeightMm)) {
          errors.push(`${label}: sill must be below the ceiling`);
        }
      }

      return { type, offsetMm, widthMm, sillMm };
    });

    return { id, lengthMm, openings: cleanOpenings };
  });

  if (errors.length) {
    throw new AppError(httpStatus.BAD_REQUEST, errors.join("; "));
  }

  return { shape, ceilingHeightMm, source, walls: cleanWalls };
};
