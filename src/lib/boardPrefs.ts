// Board appearance: piece set and square colors, remembered per browser.
import { useSyncExternalStore } from "react";

export interface PieceSet {
  id: string;
  label: string;
  credit: string;
}

// SVG sets from the Lichess repository (public/piece/), all licensed for reuse.
export const PIECE_SETS: PieceSet[] = [
  { id: "cburnett", label: "Classic (cburnett)", credit: "Colin M.L. Burnett, GPLv2+" },
  { id: "merida", label: "Merida", credit: "Armando Hernandez Marroquin, GPLv2+" },
  { id: "mpchess", label: "MPChess", credit: "Maxime Chupin, GPLv3+" },
  { id: "chessnut", label: "Chessnut", credit: "Alexis Luengas, Apache 2.0" },
  { id: "celtic", label: "Celtic", credit: "Maurizio Monge, MIT" },
  { id: "fantasy", label: "Fantasy", credit: "Maurizio Monge, MIT" },
  { id: "spatial", label: "Spatial", credit: "Maurizio Monge, MIT" },
  { id: "unicode", label: "Text symbols", credit: "Unicode chess glyphs" },
];

export interface BoardTheme {
  id: string;
  label: string;
  light: string;
  dark: string;
}

export const BOARD_THEMES: BoardTheme[] = [
  { id: "brown", label: "Brown", light: "#f0d9b5", dark: "#b58863" },
  { id: "green", label: "Green", light: "#eeeed2", dark: "#769656" },
  { id: "blue", label: "Blue", light: "#dee3e6", dark: "#8ca2ad" },
  { id: "wood", label: "Wood", light: "#e9c99a", dark: "#a8703f" },
  { id: "slate", label: "Slate", light: "#dfe3e8", dark: "#7d8796" },
  { id: "purple", label: "Purple", light: "#e8dff2", dark: "#9a7bb6" },
  { id: "coral", label: "Coral", light: "#f3e4d7", dark: "#d98a73" },
  { id: "night", label: "Night", light: "#9aa4b1", dark: "#4b5563" },
];

export interface BoardPrefs {
  pieces: string;
  theme: string;
  /** Read moves aloud as they are played. */
  speak: boolean;
}

const KEY = "chess-analyzer:board";
const DEFAULTS: BoardPrefs = { pieces: "cburnett", theme: "brown", speak: false };
const listeners = new Set<() => void>();

function read(): BoardPrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<BoardPrefs>;
    return {
      pieces: PIECE_SETS.some((p) => p.id === saved.pieces) ? saved.pieces! : DEFAULTS.pieces,
      theme: BOARD_THEMES.some((t) => t.id === saved.theme) ? saved.theme! : DEFAULTS.theme,
      speak: saved.speak === true,
    };
  } catch {
    return DEFAULTS;
  }
}

let current = read();

export function setBoardPrefs(change: Partial<BoardPrefs>): void {
  current = { ...current, ...change };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // not remembered across visits; still applies now
  }
  listeners.forEach((l) => l());
}

export function useBoardPrefs(): BoardPrefs {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}

export function themeOf(id: string): BoardTheme {
  return BOARD_THEMES.find((t) => t.id === id) ?? BOARD_THEMES[0];
}
