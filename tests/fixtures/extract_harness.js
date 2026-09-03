// Test-only Worker: runs the production HTML extractor inside real workerd so the
// HTMLRewriter path is exercised by node --test through wrangler's in-process dev server.
// POST /             body = HTML, header x-base-url  -> extractFromHtml(html, base)
// POST /self-origin  body = HTML                      -> extractSensor through a fake asset
//                                                       binding that redirects /page.html to /page
import { extractFromHtml, extractSensor } from "../../src/sensors/extract.js";

function assetsServing(html) {
  return {
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/page.html") return new Response(null, { status: 307, headers: { location: "/page" } });
      if (path === "/page") return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
      return new Response("not found", { status: 404 });
    },
  };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const html = await request.text();
    if (url.pathname === "/self-origin") {
      const origin = "https://self.example";
      return Response.json(await extractSensor(new URL(`${origin}/page.html`), undefined, { origin, assets: assetsServing(html) }));
    }
    return Response.json(await extractFromHtml(html, request.headers.get("x-base-url") ?? "https://fixture.example/"));
  },
};
