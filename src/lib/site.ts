// Public project links shown in the BLAZE banner. Override with NEXT_PUBLIC_* env vars.
export const SITE = {
  name: "Unlock",
  tagline: "Sell anything for Bitcoin Cash — with one link.",
  slidesUrl: process.env.NEXT_PUBLIC_SLIDES_URL || "/presentation.pdf",
  videoUrl: process.env.NEXT_PUBLIC_VIDEO_URL || "https://youtu.be/DoTlL8imJ1o",
  repoUrl: process.env.NEXT_PUBLIC_REPO_URL || "https://github.com/aquarush/unlock",
  // Token-aware (z…) form of the Cashonize address bitcoincash:qp7slgwzvqw78zxahgczh329v3vne072zy3xcd9x94: same wallet.
  donationAddress: process.env.NEXT_PUBLIC_DONATION_ADDRESS || "bitcoincash:zp7slgwzvqw78zxahgczh329v3vne072zykvtntq6x",
  demoListing: process.env.NEXT_PUBLIC_DEMO_LISTING || "",
};
