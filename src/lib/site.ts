// Public project links shown in the BLAZE banner. Override with NEXT_PUBLIC_* env vars.
export const SITE = {
  name: "Unlock",
  tagline: "Sell anything for Bitcoin Cash — with one link.",
  slidesUrl: process.env.NEXT_PUBLIC_SLIDES_URL || "https://youtu.be/DoTlL8imJ1o",
  repoUrl: process.env.NEXT_PUBLIC_REPO_URL || "https://github.com/aquarush/unlock",
  donationAddress: process.env.NEXT_PUBLIC_DONATION_ADDRESS || "",
  demoListing: process.env.NEXT_PUBLIC_DEMO_LISTING || "",
};
