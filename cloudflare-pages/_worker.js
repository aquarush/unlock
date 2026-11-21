// Cloudflare Pages (advanced mode): forwards every request to the Unlock server on the VPS,
// so the site is reachable at <project>.pages.dev. The VPS does all the work.
const ORIGIN = "https://162-35-99-74.sslip.io";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = new URL(url.pathname + url.search, ORIGIN);

    const headers = new Headers(request.headers);
    headers.set("X-Forwarded-Host", url.host);
    headers.set("X-Forwarded-Proto", "https");

    const res = await fetch(target, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "manual",
    });

    // Keep redirects on the pages.dev name.
    const out = new Response(res.body, res);
    const loc = out.headers.get("Location");
    if (loc && loc.startsWith(ORIGIN)) out.headers.set("Location", url.origin + loc.slice(ORIGIN.length));
    return out;
  },
};
