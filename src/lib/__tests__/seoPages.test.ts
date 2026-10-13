import { describe, expect, it } from "vitest";
import legendsJson from "../../../public/legends/index.json?raw";
import { OPENING_DRILLS } from "../drillData";
import type { LegendIndexEntry } from "../legends";
import { absoluteUrl, esc, legendPage, legendsIndexPage, legendsPlaying, openingPage, openingsIndexPage, robotsTxt, sitemapXml, type Page, type Site } from "../seoPages";

const legends = JSON.parse(legendsJson) as LegendIndexEntry[];
const site: Site = { origin: "https://example.com", base: "/chess-analyzer/" };

const pages: Page[] = [
  legendsIndexPage(legends, site),
  openingsIndexPage(OPENING_DRILLS, site),
  ...legends.map((l) => legendPage(l, l.famous.map((f) => ({ title: f.title, index: f.index, row: null })), legends, OPENING_DRILLS, site)),
  ...OPENING_DRILLS.map((d) => openingPage(d, legends, OPENING_DRILLS, site)),
];
const tag = (html: string, re: RegExp) => html.match(re)?.[1] ?? "";
/** The text as a reader (or a search engine) sees it, without HTML escapes. */
const shown = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

describe("static search pages", () => {
  it("makes one page per legend and opening plus the two index pages", () => {
    expect(pages.length).toBe(legends.length + OPENING_DRILLS.length + 2);
    expect(new Set(pages.map((p) => p.path)).size).toBe(pages.length);
  });

  it("gives every page a unique title and description of a sensible length, and an absolute canonical link", () => {
    const titles = pages.map((p) => tag(p.html, /<title>([^<]*)<\/title>/));
    expect(new Set(titles).size).toBe(pages.length);
    for (const p of pages) {
      const title = shown(tag(p.html, /<title>([^<]*)<\/title>/));
      const description = shown(tag(p.html, /<meta name="description" content="([^"]*)"/));
      expect(title.length, title).toBeLessThanOrEqual(80);
      expect(description.length, description).toBeGreaterThan(60);
      expect(description.length, description).toBeLessThanOrEqual(160);
      expect(tag(p.html, /<link rel="canonical" href="([^"]*)"/)).toBe(absoluteUrl(site, p.path));
    }
  });

  it("links only to pages that exist (or to the app itself)", () => {
    const paths = new Set(pages.map((p) => p.path));
    for (const p of pages) {
      for (const [, href] of p.html.matchAll(/<a [^>]*href="([^"]+)"/g)) {
        if (href.startsWith("http")) continue;
        expect(href.startsWith(site.base), `${p.path} -> ${href}`).toBe(true);
        const rest = href.slice(site.base.length);
        if (rest === "" || rest.startsWith("#")) continue; // the app
        expect(paths.has(rest.split("#")[0]), `${p.path} links to missing ${rest}`).toBe(true);
      }
    }
  });

  it("has a title, one heading, valid structured data and no raw script-breaking text", () => {
    for (const p of pages) {
      expect((p.html.match(/<h1>/g) ?? []).length).toBe(1);
      const ld = JSON.parse(tag(p.html, /<script type="application\/ld\+json">(.*?)<\/script>/s)) as { "@graph": { "@type": string }[] };
      expect(ld["@graph"].map((g) => g["@type"])).toEqual(["WebPage", "BreadcrumbList"]);
      expect(p.html.startsWith("<!doctype html>")).toBe(true);
    }
  });

  it("describes a legend only with facts from the data", () => {
    const morphy = legends.find((l) => l.id === "morphy")!;
    const page = legendPage(morphy, [{ title: "The Opera Game", index: 124, row: ["Morphy, Paul", "Duke Karl", "1-0", "1858-11-02", "Paris it", "C41", null, null, 33, 0, "w"] }], legends, OPENING_DRILLS, site);
    expect(page.html).toContain(`${morphy.profile.results.wins} wins, ${morphy.profile.results.draws} draws and ${morphy.profile.results.losses} losses`);
    expect(page.html).toContain("The Opera Game");
    expect(page.html).toContain("(Morphy, Paul vs Duke Karl, 1-0, 1858)");
    expect(page.html).not.toContain("Paris it");
    expect(page.html).toContain(`${site.base}#/legends/morphy?g=morphy-124`);
    expect(page.html).not.toMatch(/\bA attacker\b/);
  });

  it("lists the legends who played an opening family, most games first, and none for an unmatched one", () => {
    const italian = legendsPlaying("italian-pianissimo", legends);
    expect(italian.length).toBeGreaterThan(2);
    expect(italian.map((x) => x.games)).toEqual([...italian.map((x) => x.games)].sort((a, b) => b - a));
    expect(legendsPlaying("london", legends)).toEqual([]);
    expect(legendsPlaying("no-such-drill", legends)).toEqual([]);
  });

  it("shows an opening's line with correct move numbers and its ideas", () => {
    const page = openingPage(OPENING_DRILLS[0], legends, OPENING_DRILLS, site);
    expect(page.html).toContain("1. e4 e5 2. Nf3 Nc6 3. Bc4");
    expect(page.html).toContain("<strong>2. Nf3</strong>: Develop with a threat");
  });

  it("escapes text that came from data", () => {
    expect(esc('<b>"R&D"</b>')).toBe("&lt;b&gt;&quot;R&amp;D&quot;&lt;/b&gt;");
  });

  it("writes a sitemap and robots.txt that point at each other", () => {
    const xml = sitemapXml(site, ["", "legends/", "legends/morphy/"], "2026-10-13");
    expect(xml).toContain("<loc>https://example.com/chess-analyzer/legends/morphy/</loc>");
    expect(xml).toContain("<lastmod>2026-10-13</lastmod>");
    expect(robotsTxt(site)).toContain("Sitemap: https://example.com/chess-analyzer/sitemap.xml");
  });
});
