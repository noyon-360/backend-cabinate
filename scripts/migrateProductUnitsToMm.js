// One-off: converts products whose dimensions were entered in inches to mm,
// the unit product.model.js and the layout engine use.
//
// A product counts as inches when its width and height are both under
// INCH_LIMIT (no real cabinet is under 100 mm wide and tall; a 24" base
// is stored as 24). Values become whole mm (× 25.4, rounded).
//
//   node scripts/migrateProductUnitsToMm.js           dry run, prints the changes
//   node scripts/migrateProductUnitsToMm.js --apply   writes them
//
// Saved job layouts keep their old sizes: Regenerate the AI layout on a job
// to rebuild it with the new ones.
import "dotenv/config";
import mongoose from "mongoose";
import Product from "../model/product.model.js";

const INCH_LIMIT = 100;
const MM_PER_INCH = 25.4;
const apply = process.argv.includes("--apply");

const toMm = (inches) => Math.round(inches * MM_PER_INCH);

await mongoose.connect(process.env.MONGO_DB_URL);

const products = await Product.find({
  width: { $lt: INCH_LIMIT },
  height: { $lt: INCH_LIMIT },
});

for (const p of products) {
  const next = { width: toMm(p.width), height: toMm(p.height), depth: toMm(p.depth) };
  console.log(
    `${p.sku.padEnd(10)} ${p.width}×${p.height}×${p.depth} in → ` +
      `${next.width}×${next.height}×${next.depth} mm`
  );
  if (apply) await Product.updateOne({ _id: p._id }, { $set: next });
}

console.log(
  `${products.length} product(s) ${apply ? "converted" : "would be converted (dry run, add --apply)"}`
);
await mongoose.disconnect();
