// Writes the static pages search engines can index (one per legend and per opening, plus index pages, sitemap.xml
// and robots.txt) into dist/, after `vite build`. The page code is in src/lib/seoPages.ts.
//
//   node scripts/prerender.ts
//
// SITE_URL (optional) is the site's origin for canonical links and the sitemap, e.g. https://example.com; it defaults to
// the GitHub Pages address. The app's base path is read from the built dist/index.html, so it always matches the build.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { OPENING_DRILLS } from "../src/lib/drillData.ts";
import type { LegendGameRow, LegendIndexEntry } from "../src/lib/legends.ts";
import { legendPage, legendsIndexPage, openingPage, openingsIndexPage, robotsTxt, sitemapXml, type Page, type Site } from "../src/lib/seoPages.ts";

const DIST = "dist";
const html = readFileSync(join(DIST, "index.html"), "utf8");
const base = html.match(/href="([^"]*)favicon\.svg"/)?.[1];
if (base === undefined) throw new Error("Couldn't find the app's base path in dist/index.html. Run `vite build` first.");
const site: Site = { origin: (process.env.SITE_URL || "https://manojchandrak.github.io").replace(/\/+$/, ""), base };

const legends = JSON.parse(readFileSync("public/legends/index.json", "utf8")) as LegendIndexEntry[];
const pages: Page[] = [legendsIndexPage(legends, site), openingsIndexPage(OPENING_DRILLS, site)];

for (const legend of legends) {
  const games = JSON.parse(readFileSync(`public/legends/${legend.id}.json`, "utf8")) as LegendGameRow[];
  const famous = legend.famous.map((f) => ({ title: f.title, index: f.index, row: games[f.index] ?? null }));
  pages.push(legendPage(legend, famous, legends, OPENING_DRILLS, site));
}
for (const drill of OPENING_DRILLS) pages.push(openingPage(drill, legends, OPENING_DRILLS, site));

for (const page of pages) {
  const file = join(DIST, page.path, "index.html");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, page.html);
}

const lastmod = new Date().toISOString().slice(0, 10);
writeFileSync(join(DIST, "sitemap.xml"), sitemapXml(site, ["", ...pages.map((p) => p.path)], lastmod));
writeFileSync(join(DIST, "robots.txt"), robotsTxt(site));
console.log(`Wrote ${pages.length} static pages, sitemap.xml and robots.txt for ${site.origin}${site.base}`);
