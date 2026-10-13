// Keeps one signed-in person's saved data (see merge.ts) in step between this device's browser storage and their account.
import { SyncUnavailableError, type ForumBackend } from "../forum/types.ts";
import { SYNC_KEYS, SYNC_NAMES, changedHere, reconcile, type Fingerprints, type LocalCopies, type SyncName } from "./merge.ts";

export interface SyncStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type SyncStatus = "idle" | "syncing" | "saved" | "error" | "unavailable";

const META_KEY = "chess-analyzer:sync-meta";

interface Meta {
  /** Whose account this device's saved data belongs to, so one person's data is never mixed into another's. */
  owner: string | null;
  /** Fingerprints of what this device last saved to (or got from) the account. */
  fingerprints: Fingerprints;
}

export interface SyncOptions {
  backend: ForumBackend;
  storage: SyncStorage;
  userId: string;
  /** Called after the account's data was written into this device's storage, so the screens can re-read it. */
  onApplied?: () => void;
  onStatus?: (status: SyncStatus) => void;
}

export function createSync({ backend, storage, userId, onApplied, onStatus }: SyncOptions) {
  let unavailable = false;
  let running: Promise<void> | null = null;
  let rerun = false;

  function readMeta(): Meta {
    try {
      const m = JSON.parse(storage.getItem(META_KEY) ?? "null") as Partial<Meta> | null;
      return { owner: typeof m?.owner === "string" ? m.owner : null, fingerprints: m?.fingerprints && typeof m.fingerprints === "object" ? m.fingerprints : {} };
    } catch {
      return { owner: null, fingerprints: {} };
    }
  }
  const writeMeta = (meta: Meta) => storage.setItem(META_KEY, JSON.stringify(meta));
  const readLocal = (): LocalCopies => Object.fromEntries(SYNC_NAMES.map((name) => [name, storage.getItem(SYNC_KEYS[name])]));

  /** If this device last held someone else's saved data, clear it first, so it can never end up in this account. */
  function claimDevice(): Meta {
    const meta = readMeta();
    if (meta.owner === userId) return meta;
    if (meta.owner) for (const name of SYNC_NAMES) storage.removeItem(SYNC_KEYS[name]);
    const claimed: Meta = { owner: userId, fingerprints: meta.owner ? {} : meta.fingerprints };
    writeMeta(claimed);
    return claimed;
  }

  async function once(): Promise<void> {
    onStatus?.("syncing");
    const meta = claimDevice();
    const remote = await backend.loadUserData();
    const plan = reconcile(readLocal(), remote, meta.fingerprints);

    for (const name of SYNC_NAMES) {
      const text = plan.applyLocal[name];
      if (text !== undefined) storage.setItem(SYNC_KEYS[name], text);
    }
    const fingerprints: Fingerprints = { ...plan.fingerprints };
    let failure: unknown = null;
    for (const name of Object.keys(plan.push) as SyncName[]) {
      try {
        await backend.saveUserData(name, plan.push[name]);
      } catch (e) {
        failure ??= e;
        fingerprints[name] = meta.fingerprints[name]; // not saved yet, so it still counts as changed here
        if (fingerprints[name] === undefined) delete fingerprints[name];
      }
    }
    writeMeta({ owner: userId, fingerprints });
    if (Object.keys(plan.applyLocal).length > 0) onApplied?.();
    if (failure) throw failure;
    onStatus?.("saved");
  }

  /** Pulls the account's data, merges it with this device's, and saves what changed. Safe to call often. */
  function run(): Promise<void> {
    if (unavailable) return Promise.resolve();
    if (running) {
      rerun = true;
      return running;
    }
    running = once()
      .catch((e: unknown) => {
        if (e instanceof SyncUnavailableError) {
          unavailable = true;
          onStatus?.("unavailable");
        } else onStatus?.("error");
      })
      .finally(() => {
        running = null;
        if (rerun) {
          rerun = false;
          void run();
        }
      });
    return running;
  }

  return {
    run,
    /** Whether something changed on this device since it was last saved to the account. */
    hasChanges: () => !unavailable && changedHere(readLocal(), readMeta().fingerprints).length > 0,
    isUnavailable: () => unavailable,
  };
}
