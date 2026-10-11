import path from "path";
import { fileURLToPath } from "url";
import PDFDocument from "pdfkit";

// Renders the proposal view (see buildProposalView in job.controller.js)
// as a one-page A4 PDF. Same sections and colours as the app's Proposal
// screen; the data must already be final, nothing is computed here.

const FONTS = path.join(path.dirname(fileURLToPath(import.meta.url)), "../assets/fonts");

const C = {
  brown: "#C29266",
  tag: "#ECDDD0",
  cream: "#F9F4F0",
  border: "#ECDDD0",
  text: "#000000",
  muted: "#7A7972",
};

const MARGIN = 40;

const money = (v) =>
  `$${Number(v).toLocaleString("en-US", {
    minimumFractionDigits: v % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;

const longDate = (d) =>
  new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

/** Fetches the layout PNG; a missing drawing shouldn't block the PDF. */
const fetchImage = async (url) => {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
};

/** @returns Promise<Buffer> */
export const renderProposalPdf = async (view) => {
  const layoutImage = await fetchImage(view.layoutImageUrl);

  const doc = new PDFDocument({ size: "A4", margin: MARGIN });
  doc.registerFont("body", path.join(FONTS, "DMSans-Regular.ttf"));
  doc.registerFont("medium", path.join(FONTS, "DMSans-Medium.ttf"));
  doc.registerFont("semibold", path.join(FONTS, "DMSans-SemiBold.ttf"));
  doc.registerFont("heading", path.join(FONTS, "PlayfairDisplay-SemiBold.ttf"));

  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const left = MARGIN;
  const width = doc.page.width - MARGIN * 2;
  const right = left + width;

  const sectionTitle = (text) => {
    doc.moveDown(0.8);
    doc.font("medium").fontSize(11).fillColor(C.brown).text(text, left);
    doc.moveDown(0.3);
  };
  const divider = () => {
    doc.moveDown(0.6);
    doc.moveTo(left, doc.y).lineTo(right, doc.y).lineWidth(0.5).strokeColor(C.border).stroke();
  };
  const row = (label, value, { bold = false } = {}) => {
    const y = doc.y;
    doc.font(bold ? "semibold" : "body").fontSize(bold ? 12 : 10).fillColor(C.text);
    doc.text(label, left, y, { width: width * 0.7 });
    const labelBottom = doc.y;
    doc.text(value, left, y, { width, align: "right" });
    doc.y = Math.max(labelBottom, doc.y) + 4;
  };

  // ── Header band ──
  const headerHeight = 56;
  doc.rect(left, MARGIN, width, headerHeight).fill(C.tag);
  doc.font("heading").fontSize(18).fillColor(C.brown)
    .text(view.business.name, left + 14, MARGIN + 10, { width: width * 0.6 });
  doc.font("body").fontSize(9).fillColor(C.muted)
    .text(view.business.tagline, left + 14, MARGIN + 34, { width: width * 0.6 });
  doc.font("body").fontSize(10).fillColor(C.text)
    .text(longDate(view.date), left, MARGIN + 12, { width: width - 14, align: "right" });
  doc.font("body").fontSize(9).fillColor(C.muted)
    .text(`Ref: ${view.jobRef}`, left, MARGIN + 30, { width: width - 14, align: "right" });
  doc.y = MARGIN + headerHeight;

  // ── Prepared for ──
  sectionTitle("Prepared For");
  doc.font("semibold").fontSize(13).fillColor(C.text).text(view.customer.name, left);
  doc.font("body").fontSize(10).fillColor(C.muted)
    .text(view.customer.address, left)
    .text([view.customer.phone, view.customer.email].filter(Boolean).join(" · "), left);
  divider();

  // ── Layout drawing ──
  if (layoutImage) {
    sectionTitle("Cabinet Layout");
    const maxHeight = 300;
    try {
      doc.image(layoutImage, left, doc.y, { fit: [width, maxHeight], align: "center" });
      doc.y += maxHeight;
    } catch {
      // Not a PNG/JPEG pdfkit can read; skip the drawing.
    }
    divider();
  }

  // ── Quotation ──
  sectionTitle("Quotation Summary");
  for (const line of view.lines) {
    row(`${line.quantity}× ${line.name}`, money(line.lineTotal));
  }
  doc.moveDown(0.3);
  row("Products subtotal", money(view.subTotal));
  if (view.installationCharge) row("Installation", money(view.installationCharge));
  if (view.deliveryCharge) row("Delivery", money(view.deliveryCharge));
  row(`Tax (${view.taxRate}%)`, money(view.taxAmount));
  divider();
  doc.moveDown(0.4);
  row("Total", money(view.total), { bold: true });
  divider();

  // ── Terms ──
  sectionTitle("Terms");
  doc.font("body").fontSize(9).fillColor(C.muted).text(view.terms, left, doc.y, { width });

  doc.end();
  return done;
};
