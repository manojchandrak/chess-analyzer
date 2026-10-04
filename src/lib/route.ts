// The page's state in the URL hash, so a tab, a legend or a game at a given move can be
// shared as a link: "#/legends/morphy", "#/mine?lichess=name", "#/mine?g=lichess:abc123&ply=14".

export type Tab = "mine" | "legends" | "pgn";

export interface Route {
  tab: Tab;
  legend?: string;
  lichess?: string;
  chesscom?: string;
  /** Game id: "lichess:<id>" or a legend game ("morphy-12"). */
  game?: string;
  ply?: number;
}

const TABS: Tab[] = ["mine", "legends", "pgn"];

export function parseHash(hash: string): Route {
  const [path, query = ""] = hash.replace(/^#\/?/, "").split("?");
  const [tabPart, legend] = path.split("/");
  const params = new URLSearchParams(query);
  const route: Route = { tab: TABS.includes(tabPart as Tab) ? (tabPart as Tab) : "mine" };
  if (route.tab === "legends" && legend) route.legend = decodeURIComponent(legend);
  for (const key of ["lichess", "chesscom"] as const) {
    const v = params.get(key)?.trim();
    if (v) route[key] = v;
  }
  const game = params.get("g")?.trim();
  if (game) route.game = game;
  const ply = Number(params.get("ply"));
  if (game && Number.isInteger(ply) && ply > 0) route.ply = ply;
  return route;
}

export function buildHash(route: Route): string {
  const params = new URLSearchParams();
  if (route.lichess) params.set("lichess", route.lichess);
  if (route.chesscom) params.set("chesscom", route.chesscom);
  if (route.game) {
    params.set("g", route.game);
    if (route.ply) params.set("ply", String(route.ply));
  }
  const path = route.tab === "legends" && route.legend ? `legends/${encodeURIComponent(route.legend)}` : route.tab;
  const query = params.toString();
  return `#/${path}${query ? `?${query}` : ""}`;
}

/** Whether a game can be reopened from its link alone (Lichess games and legends' games). */
export function isShareable(gameId: string | null | undefined): boolean {
  return !!gameId && (gameId.startsWith("lichess:") || /^[a-z]+-\d+$/.test(gameId));
}
