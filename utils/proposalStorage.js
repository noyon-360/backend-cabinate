import { v2 as cloudinary } from "cloudinary";
import { uploadOnCloudinary } from "./commonMethod.js";

// Proposal PDFs hold customer details, so they're stored as private
// ("authenticated") Cloudinary files. Their URLs are not publicly readable;
// the API fetches them with a short-lived signed URL after checking the
// user. This also works when the account blocks public PDF delivery.

const OPTIONS = { resource_type: "raw", type: "authenticated" };

/** @returns { publicId, url } */
export const uploadProposalPdf = async (buffer, jobRef) => {
  const upload = await uploadOnCloudinary(buffer, {
    ...OPTIONS,
    folder: "snapndesign/proposals",
    // Raw files keep their extension in the public_id.
    public_id: `${jobRef}-${Date.now()}.pdf`,
  });
  return { publicId: upload.public_id, url: upload.secure_url };
};

/** Best effort: a leftover file shouldn't fail the request. */
export const deleteProposalPdf = async (publicId) => {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, OPTIONS);
  } catch (err) {
    console.error("Proposal PDF delete error:", err);
  }
};

/** Fetches the private file's bytes through a 60-second signed URL. */
export const fetchProposalPdf = async (publicId) => {
  const url = cloudinary.utils.private_download_url(publicId, "", {
    ...OPTIONS,
    expires_at: Math.floor(Date.now() / 1000) + 60,
  });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Cloudinary download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
};
