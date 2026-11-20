// Public project links shown in the BLAZE banner. Set these in Vercel env vars.
export const SITE = {
  name: "Unlock",
  tagline: "Sell anything for Bitcoin Cash — with one link.",
  slidesUrl: process.env.NEXT_PUBLIC_SLIDES_URL || "https://docs.google.com/presentation/d/1Yfuk9CJkf4U9M_WukcELhumWgj3Ak6345Ewy8hSp-Hk/edit?usp=sharing",
  repoUrl: process.env.NEXT_PUBLIC_REPO_URL || "https://github.com/",
  donationAddress: process.env.NEXT_PUBLIC_DONATION_ADDRESS || "",
  demoListing: process.env.NEXT_PUBLIC_DEMO_LISTING || "",
};
