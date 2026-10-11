// Static business details shown on proposals. Override in .env; later this
// can come from the owner's profile without changing the proposal shape.
export const BUSINESS = {
  name: process.env.BUSINESS_NAME ?? "CabinetCraft Pro",
  tagline: process.env.BUSINESS_TAGLINE ?? "Professional Kitchen Design & Supply",
};
