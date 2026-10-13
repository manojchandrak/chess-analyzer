import { clearReviews } from "./store.ts";

const PREFIX = "chess-analyzer:";

/** Removes everything this app has stored in this browser: settings, usernames, progress, ratings and cached reviews.
 * Returns how many items were removed from local storage (reviews are cleared too). */
export async function clearDeviceData(storage: Pick<Storage, "length" | "key" | "removeItem"> = window.localStorage): Promise<number> {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(PREFIX)) keys.push(key);
  }
  keys.forEach((key) => storage.removeItem(key));
  await clearReviews();
  return keys.length;
}
