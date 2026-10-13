// What gets saved to a signed-in person's account, and how this device's copy and the account's copy are combined.
// Everything here is plain functions on plain data, so the rules can be tested without a browser or a database.
import type { UserDataEntry } from "../forum/types.ts";
import { mergeHistory, parseHistory } from "../historyCore.ts";

/** Each kind of saved data, and the browser storage key it lives in on this device. The names are the keys used in the database. */
export const SYNC_KEYS = {
  usernames: "chess-analyzer:usernames",
  options: "chess-analyzer:recent-options",
  board: "chess-analyzer:board",
  drills: "chess-analyzer:drills:v1",
  stats: "chess-analyzer:stats:v1",
  puzzles: "chess-analyzer:puzzles:v1",
  history: "chess-analyzer:history:v1",
} as const;

export type SyncName = keyof typeof SYNC_KEYS;
export const SYNC_NAMES = Object.keys(SYNC_KEYS) as SyncName[];

/** Progress that only grows: both copies are combined so nothing earned on one device is lost on another. */
const COMBINED = new Set<SyncName>(["drills", "stats", "puzzles", "history"]);

/** JSON with object keys in a fixed order, so the same data always gives the same text (the database reorders keys). */
export function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** A short fingerprint of some text, used to notice that this device's copy changed since it was last saved. */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Combines this device's progress with the account's. Anything unrecognisable is ignored in favour of the other side. */
export function combine(name: SyncName, local: unknown, remote: unknown): unknown {
  if (name === "history") return mergeHistory(parseHistory(local), parseHistory(remote));
  if (name === "puzzles") {
    if (!Array.isArray(local) || !Array.isArray(remote)) return Array.isArray(local) ? local : remote;
    return [...new Set([...remote, ...local].filter((id): id is string => typeof id === "string"))].sort();
  }
  if (!isRecord(local) || !isRecord(remote)) return isRecord(local) ? local : remote;
  if (name === "stats") return { ...remote, ...local };
  // drills: for each drill keep whichever copy was practised most recently
  const merged: Record<string, unknown> = { ...remote };
  for (const [id, record] of Object.entries(local)) {
    const other = merged[id];
    const lastOf = (r: unknown) => (isRecord(r) && typeof r.last === "number" ? r.last : 0);
    merged[id] = other === undefined || lastOf(record) >= lastOf(other) ? record : other;
  }
  return merged;
}

export type LocalCopies = Partial<Record<SyncName, string | null>>;
export type Fingerprints = Partial<Record<SyncName, string>>;

export interface Plan {
  /** What to store on this device (already in the stable form). */
  applyLocal: Partial<Record<SyncName, string>>;
  /** What to save to the account. */
  push: Partial<Record<SyncName, unknown>>;
  /** Fingerprints of this device's copy after the plan is carried out. */
  fingerprints: Fingerprints;
}

function parse(raw: string | null | undefined): { value: unknown } | null {
  if (raw == null) return null;
  try {
    return { value: JSON.parse(raw) as unknown };
  } catch {
    return null; // damaged text on this device: treat as not there
  }
}

/**
 * Works out what to do for each kind of data, given this device's copy, the account's copy, and fingerprints of
 * what this device last saved. Settings: if you changed them on this device since the last save they win, otherwise
 * the account's copy does. Progress: both copies are combined.
 */
export function reconcile(local: LocalCopies, remote: Record<string, UserDataEntry>, saved: Fingerprints): Plan {
  const plan: Plan = { applyLocal: {}, push: {}, fingerprints: {} };
  for (const name of SYNC_NAMES) {
    const l = parse(local[name]);
    const r = remote[name];
    if (!l && !r) continue;
    if (!l && r) {
      const text = stable(r.value);
      plan.applyLocal[name] = text;
      plan.fingerprints[name] = fingerprint(text);
      continue;
    }
    const localText = stable(l!.value);
    if (!r) {
      plan.push[name] = l!.value;
      plan.fingerprints[name] = fingerprint(localText);
      continue;
    }
    const remoteText = stable(r.value);
    if (COMBINED.has(name)) {
      const merged = combine(name, l!.value, r.value);
      const text = stable(merged);
      if (text !== localText) plan.applyLocal[name] = text;
      if (text !== remoteText) plan.push[name] = merged;
      plan.fingerprints[name] = fingerprint(text);
    } else {
      const editedHere = saved[name] !== undefined && saved[name] !== fingerprint(localText);
      if (editedHere) {
        if (localText !== remoteText) plan.push[name] = l!.value;
        plan.fingerprints[name] = fingerprint(localText);
      } else {
        if (remoteText !== localText) plan.applyLocal[name] = remoteText;
        plan.fingerprints[name] = fingerprint(remoteText);
      }
    }
  }
  return plan;
}

/** Which kinds of data on this device differ from what was last saved to the account. */
export function changedHere(local: LocalCopies, saved: Fingerprints): SyncName[] {
  return SYNC_NAMES.filter((name) => {
    const l = parse(local[name]);
    return !!l && saved[name] !== fingerprint(stable(l.value));
  });
}
