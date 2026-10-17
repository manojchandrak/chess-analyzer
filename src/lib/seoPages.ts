// Static, crawlable pages for search engines: one per legend and one per opening drill, plus index pages, a sitemap and
// robots.txt. The app itself is a single page (its "#/..." links look like one page to a search engine), so these real
// pages, written into the build by scripts/prerender.ts, are what can show up in search results. Everything here is
// built only from the data the app already ships; nothing is invented. Plain functions, no file access.
import type { LineDrill } from "./drillData.ts";
import type { LegendGameRow, LegendIndexEntry } from "./legends.ts";

export const SITE_NAME = "MyChessAnalyzer";

export interface Site {
  /** Where the site lives, without a trailing slash, e.g. "https://manojchandrak.github.io". */
  origin: string;
  /** The path the app is served under, with slashes, e.g. "/chess-analyzer/" (or "/" on its own domain). */
  base: string;
}

export interface Page {
  /** Path under the base, ending in "/" (or "" for the home page), e.g. "legends/morphy/". */
  path: string;
  html: string;
}

export const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const jsonLd = (data: unknown): string => JSON.stringify(data).replace(/</g, "\\u003c");
const clip = (s: string, max: number): string => (s.length <= max ? s : `${s.slice(0, max - 1).replace(/\s+\S*$/, "")}…`);

export const absoluteUrl = (site: Site, path: string): string => `${site.origin}${site.base}${path}`;

/** Which of a legend's repertoire entries count as playing each opening drill (the legends' data names openings by family). */
const OPENING_FAMILIES: Record<string, { label: string; match: RegExp; note?: string }> = {
  "italian-pianissimo": { label: "Italian Game", match: /^Italian Game/i },
  "ruy-lopez-closed": { label: "Ruy Lopez", match: /^Ruy Lopez/i },
  scotch: { label: "Scotch Game", match: /^Scotch Game/i },
  "qgd-capablanca": { label: "Queen's Gambit Declined", match: /^Queen.s Gambit Declined/i },
  london: { label: "London System", match: /London System/i },
  "najdorf-english": { label: "Sicilian Defense", match: /^Sicilian Defen[cs]e/i, note: "The Najdorf is a line of the Sicilian Defense, so these are the legends' Sicilian games." },
  "caro-kann-classical": { label: "Caro-Kann Defense", match: /^Caro-Kann/i },
  "french-advance": { label: "French Defense", match: /^French Defen[cs]e/i },
  scandinavian: { label: "Scandinavian Defense", match: /^Scandinavian/i },
  "kings-indian": { label: "King's Indian Defense", match: /^King.s Indian/i },
  "qgd-tartakower": { label: "Queen's Gambit Declined", match: /^Queen.s Gambit Declined/i },
};

const TRAITS: { key: "aggression" | "risk" | "endgame" | "solidity" | "simplification"; label: string }[] = [
  { key: "aggression", label: "Aggression" },
  { key: "risk", label: "Risk-taking" },
  { key: "endgame", label: "Endgame bias" },
  { key: "solidity", label: "Solidity" },
  { key: "simplification", label: "Simplification" },
];

const STYLE = `
:root{--bg:#fff;--fg:#1b1d21;--muted:#5d6470;--card:#f6f7f9;--line:#e1e4e8;--accent:#2e7d5b}
@media (prefers-color-scheme:dark){:root{--bg:#101114;--fg:#e8eaed;--muted:#a0a7b3;--card:#17181c;--line:#2a2d33;--accent:#55c993}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
a{color:var(--accent)}header,main,footer{max-width:760px;margin:0 auto;padding:16px 20px}
header{display:flex;flex-wrap:wrap;gap:8px 20px;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line)}
.brand{font-weight:700;text-decoration:none;color:var(--fg)}nav{display:flex;gap:16px;flex-wrap:wrap;font-size:.95rem}
h1{font-size:1.9rem;line-height:1.25;margin:20px 0 6px}h2{font-size:1.25rem;margin:28px 0 8px}.lead{font-size:1.1rem;margin:0 0 6px}.muted{color:var(--muted)}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:10px 0}
.btn{display:inline-block;background:var(--accent);color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600;margin:6px 8px 6px 0}
.btn.ghost{background:transparent;color:var(--accent);border:1px solid var(--accent)}
ul{padding-left:20px}li{margin:4px 0}.line{font-size:1.1rem;font-weight:600;word-spacing:2px}
.bar{height:8px;background:var(--line);border-radius:4px;overflow:hidden;margin-top:4px}.bar>span{display:block;height:100%;background:var(--accent)}
.trait{margin:10px 0}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;padding:0;list-style:none}
.grid li{margin:0}.grid a{display:block;text-decoration:none;color:inherit}.grid .card{height:100%;margin:0}.grid strong{color:var(--accent)}
footer{border-top:1px solid var(--line);margin-top:32px;font-size:.9rem;color:var(--muted)}
`.trim();

interface PageInput {
  site: Site;
  path: string;
  title: string;
  description: string;
  heading: string;
  body: string;
  crumbs: { name: string; path: string }[];
}

function layout(p: PageInput): Page {
  const { site } = p;
  const url = absoluteUrl(site, p.path);
  const description = clip(p.description, 158);
  const crumbs = [{ name: SITE_NAME, path: "" }, ...p.crumbs, { name: p.heading, path: p.path }];
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", name: p.title, description, url, isPartOf: { "@type": "WebSite", name: SITE_NAME, url: absoluteUrl(site, "") } },
      { "@type": "BreadcrumbList", itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: absoluteUrl(site, c.path) })) },
    ],
  };
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(SITE_NAME)}">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(absoluteUrl(site, "icon-512.png"))}">
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#2e7d5b">
<link rel="icon" type="image/svg+xml" href="${esc(site.base)}favicon.svg">
<link rel="apple-touch-icon" href="${esc(site.base)}apple-touch-icon.png">
<link rel="manifest" href="${esc(site.base)}manifest.webmanifest">
<script type="application/ld+json">${jsonLd(ld)}</script>
<style>${STYLE}</style>
</head>
<body>
<header>
<a class="brand" href="${esc(site.base)}">${esc(SITE_NAME)}</a>
<nav aria-label="Main"><a href="${esc(site.base)}legends/">Legends</a><a href="${esc(site.base)}openings/">Openings</a><a href="${esc(site.base)}#/mine">Open the analyzer</a></nav>
</header>
<main>
<h1>${esc(p.heading)}</h1>
${p.body}
</main>
<footer>
<p>${esc(SITE_NAME)} is a free tool: review your Lichess and Chess.com games with Stockfish in your browser, study the legends and train with drills. <a href="${esc(site.base)}">Open the analyzer</a>.</p>
</footer>
</body>
</html>
`;
  return { path: p.path, html };
}

const pct = (n: number) => `${Math.round(n)}%`;
const resultLine = (r: { games: number; wins: number; draws: number; losses: number; score: number }) => `${r.wins} wins, ${r.draws} draws and ${r.losses} losses (${pct(r.score)} score) in ${r.games} games`;

/** The legend's opening entries that belong to one of the drills' opening families, with combined results. */
export function legendsPlaying(drillId: string, legends: LegendIndexEntry[]): { legend: LegendIndexEntry; games: number; score: number }[] {
  const family = OPENING_FAMILIES[drillId];
  if (!family) return [];
  const out: { legend: LegendIndexEntry; games: number; score: number }[] = [];
  for (const legend of legends) {
    const rows = [...legend.profile.repertoire.white, ...legend.profile.repertoire.black].filter((r) => family.match.test(r.name));
    const games = rows.reduce((n, r) => n + r.games, 0);
    if (games < 3) continue;
    const points = rows.reduce((n, r) => n + r.wins + r.draws / 2, 0);
    out.push({ legend, games, score: (points / games) * 100 });
  }
  return out.sort((a, b) => b.games - a.games).slice(0, 8);
}

/** The opening drills a legend's repertoire mentions, for linking from the legend's page. */
function openingsOf(legend: LegendIndexEntry, drills: LineDrill[]): LineDrill[] {
  const names = [...legend.profile.repertoire.white, ...legend.profile.repertoire.black].map((r) => r.name);
  return drills.filter((d) => {
    const family = OPENING_FAMILIES[d.id];
    return family && names.some((n) => family.match.test(n));
  });
}

export function legendPage(legend: LegendIndexEntry, famous: { title: string; row: LegendGameRow | null; index: number }[], all: LegendIndexEntry[], drills: LineDrill[], site: Site): Page {
  const p = legend.profile;
  const top = (list: typeof p.repertoire.white) => [...list].sort((a, b) => b.games - a.games).slice(0, 6);
  const repertoireList = (title: string, list: typeof p.repertoire.white) =>
    list.length === 0
      ? ""
      : `<h3>${esc(title)}</h3><ul>${top(list)
          .map((r) => `<li>${esc(r.name)}: ${r.games} games, ${pct(r.score)} score</li>`)
          .join("")}</ul>`;
  const related = openingsOf(legend, drills);
  const others = all.filter((l) => l.id !== legend.id);
  const body = `
<p class="lead">${esc(legend.title)}. ${esc(legend.blurb)}</p>
<p class="muted">${esc(legend.years)} · Known for: ${esc(legend.knownFor)} · ${legend.games.toLocaleString("en-US")} games in the collection</p>
<p><a class="btn" href="${esc(site.base)}#/legends/${esc(legend.id)}">Explore ${esc(legend.name)}'s games in the analyzer</a><a class="btn ghost" href="${esc(site.base)}#/mine">Compare with your own games</a></p>

<h2>Playing style: ${esc(p.archetype.label)}</h2>
<p>${esc(p.archetype.description)}</p>
${TRAITS.map((t) => `<div class="trait"><span>${esc(t.label)}</span> <span class="muted">${p.traits[t.key]} / 100</span><div class="bar" role="img" aria-label="${esc(t.label)} ${p.traits[t.key]} out of 100"><span style="width:${Math.max(0, Math.min(100, p.traits[t.key]))}%"></span></div></div>`).join("")}
<p class="muted">These scores come from the ${legend.profileGames.toLocaleString("en-US")} games used for the style profile (${legend.profileBasis === "classical" ? "classical-length games" : "all games"}), measured the same way the analyzer measures your own games.</p>

<h2>Results</h2>
<p>${esc(legend.name)} scored ${esc(resultLine(p.results))}.</p>
<ul><li>With White: ${esc(resultLine(p.byColor.w))}.</li><li>With Black: ${esc(resultLine(p.byColor.b))}.</li></ul>

<h2>Favourite openings</h2>
${repertoireList("As White", p.repertoire.white)}${repertoireList("As Black", p.repertoire.black)}
${related.length ? `<p>Practise related lines: ${related.map((d) => `<a href="${esc(site.base)}openings/${esc(d.id)}/">${esc(d.title)}</a>`).join(", ")}.</p>` : ""}
${
  famous.length
    ? `<h2>A famous game</h2><ul>${famous
        .map((f) => {
          const r = f.row;
          // a row is [white, black, result, date, ...]
          const who = r ? ` (${esc(r[0])} vs ${esc(r[1])}, ${esc(r[2])}${r[3] ? `, ${esc(r[3].slice(0, 4))}` : ""})` : "";
          return `<li><a href="${esc(site.base)}#/legends/${esc(legend.id)}?g=${esc(legend.id)}-${f.index}">${esc(f.title)}</a>${who} — replay it move by move and see Stockfish's verdict.</li>`;
        })
        .join("")}</ul>`
    : ""
}

<h2>Other legends</h2>
<ul class="grid">${others.map((l) => `<li><a href="${esc(site.base)}legends/${esc(l.id)}/"><div class="card"><strong>${esc(l.name)}</strong><br><span class="muted">${esc(l.knownFor)}</span></div></a></li>`).join("")}</ul>
`;
  return layout({
    site,
    path: `legends/${legend.id}/`,
    title: `${legend.name}: playing style, games and openings | ${SITE_NAME}`,
    description: `${legend.name} (${legend.years}): ${legend.knownFor}. Style: ${p.archetype.label.toLowerCase()}. ${p.results.wins} wins, ${p.results.draws} draws and ${p.results.losses} losses in ${p.results.games} games. Explore the games and favourite openings.`,
    heading: `${legend.name} (${legend.years}): playing style, games and openings`,
    body,
    crumbs: [{ name: "Legends", path: "legends/" }],
  });
}

export function legendsIndexPage(legends: LegendIndexEntry[], site: Site): Page {
  const body = `
<p class="lead">Twelve world champions and chess legends, each with a style profile measured from their own games: how aggressive, how risk-taking, how solid, and which openings they chose.</p>
<ul class="grid">${legends.map((l) => `<li><a href="${esc(site.base)}legends/${esc(l.id)}/"><div class="card"><strong>${esc(l.name)}</strong><br><span class="muted">${esc(l.years)} · ${esc(l.knownFor)}</span><br>${esc(l.profile.archetype.label)} · ${l.games.toLocaleString("en-US")} games</div></a></li>`).join("")}</ul>
<p><a class="btn" href="${esc(site.base)}#/legends">Browse their games in the analyzer</a></p>
`;
  return layout({
    site,
    path: "legends/",
    title: `Chess legends: playing styles | ${SITE_NAME}`,
    description: `Playing styles, results and favourite openings of ${legends.length} chess legends, from ${legends[0]?.name ?? "Paul Morphy"} to ${legends[legends.length - 1]?.name ?? "Magnus Carlsen"}, measured from their own games.`,
    heading: "Chess legends: playing styles and games",
    body,
    crumbs: [],
  });
}

const sanLine = (moves: string[]): string => moves.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${m}` : m)).join(" ");

export function openingPage(drill: LineDrill, legends: LegendIndexEntry[], all: LineDrill[], site: Site): Page {
  const sideWord = drill.side === "w" ? "White" : "Black";
  const ideas = Object.entries(drill.notes)
    .map(([i, note]) => ({ i: Number(i), note }))
    .filter((n) => n.i >= 0 && n.i < drill.moves.length)
    .sort((a, b) => a.i - b.i);
  const label = (i: number) => `${Math.floor(i / 2) + 1}${i % 2 === 0 ? "." : "..."} ${drill.moves[i]}`;
  const played = legendsPlaying(drill.id, legends);
  const family = OPENING_FAMILIES[drill.id];
  const others = all.filter((d) => d.id !== drill.id);
  const body = `
<p class="lead">${esc(drill.theme)}. A main line to learn move by move, with the idea behind each key move.</p>
<h2>The main line</h2>
<p class="line">${esc(sanLine(drill.moves))}</p>
<p class="muted">You play ${sideWord}. In the analyzer's drill the other side's moves are played for you and Stockfish checks each of yours.</p>
<p><a class="btn" href="${esc(site.base)}#/drills">Practise it with free drills</a><a class="btn ghost" href="${esc(site.base)}#/pgn">Analyze one of your own games</a></p>
${ideas.length ? `<h2>The ideas behind the moves</h2><ul>${ideas.map((n) => `<li><strong>${esc(label(n.i))}</strong>: ${esc(n.note)}</li>`).join("")}</ul>` : ""}
${
  played.length
    ? `<h2>Legends who played it</h2>${family?.note ? `<p class="muted">${esc(family.note)}</p>` : ""}<ul>${played
        .map((x) => `<li><a href="${esc(site.base)}legends/${esc(x.legend.id)}/">${esc(x.legend.name)}</a>: ${x.games} games in the ${esc(family?.label ?? drill.title)}, ${pct(x.score)} score</li>`)
        .join("")}</ul>`
    : ""
}
<h2>More openings to learn</h2>
<ul class="grid">${others.map((d) => `<li><a href="${esc(site.base)}openings/${esc(d.id)}/"><div class="card"><strong>${esc(d.title)}</strong><br><span class="muted">${esc(d.theme)}</span></div></a></li>`).join("")}</ul>
`;
  return layout({
    site,
    path: `openings/${drill.id}/`,
    title: `${drill.title}: main line and ideas | ${SITE_NAME}`,
    description: `Learn the ${drill.title} (${drill.theme}): the main line move by move, the idea behind each key move${played.length ? ", which legends played it" : ""} and how to practise it with free drills.`,
    heading: `${drill.title}: main line, ideas and how to practise it`,
    body,
    crumbs: [{ name: "Openings", path: "openings/" }],
  });
}

export function openingsIndexPage(drills: LineDrill[], site: Site): Page {
  const body = `
<p class="lead">Main lines to learn move by move, each with the ideas behind the moves and drills that check your answers with Stockfish.</p>
<ul class="grid">${drills.map((d) => `<li><a href="${esc(site.base)}openings/${esc(d.id)}/"><div class="card"><strong>${esc(d.title)}</strong><br><span class="muted">${esc(d.theme)}</span></div></a></li>`).join("")}</ul>
<p><a class="btn" href="${esc(site.base)}#/drills">Practise them in the analyzer</a></p>
`;
  return layout({
    site,
    path: "openings/",
    title: `Chess openings to learn | ${SITE_NAME}`,
    description: `${drills.length} chess opening main lines to learn move by move, with the idea behind each key move and free drills that check your answers with Stockfish.`,
    heading: "Chess openings to learn: main lines and ideas",
    body,
    crumbs: [],
  });
}

export function sitemapXml(site: Site, paths: string[], lastmod: string): string {
  const urls = paths.map((p) => `  <url><loc>${esc(absoluteUrl(site, p))}</loc><lastmod>${esc(lastmod)}</lastmod></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function robotsTxt(site: Site): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl(site, "sitemap.xml")}\n`;
}
