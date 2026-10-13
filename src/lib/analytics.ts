// Optional Google Analytics (GA4). Nothing loads unless a Measurement ID is configured AND the visitor accepted the
// banner. Only the name of the open tab is ever reported: never usernames, game links or forum thread ids.
import { parseHash } from "./route.ts";

const CONSENT_KEY = "chess-analyzer:analytics-consent";

export type Consent = "granted" | "denied";

/** A GA4 Measurement ID looks like G-ABC123XYZ. Anything else is treated as "not configured". */
export function validMeasurementId(id: string | undefined): string | null {
  const trimmed = id?.trim();
  return trimmed && /^G-[A-Z0-9]{4,20}$/.test(trimmed) ? trimmed : null;
}

export const measurementId = validMeasurementId(import.meta.env.VITE_GA_MEASUREMENT_ID);
export const analyticsAvailable = measurementId !== null;

/** The page name reported to analytics for a URL hash: just the tab ("/drills"), without usernames, games or ids. */
export function pagePathFor(hash: string): string {
  return `/${parseHash(hash).tab}`;
}

export function readConsent(storage: Pick<Storage, "getItem"> = window.localStorage): Consent | null {
  try {
    const v = storage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
    [key: `ga-disable-${string}`]: boolean | undefined;
  }
}

let loaded = false;

/** Loads Google's script (once). Only call this after the visitor has said yes. */
function load(): void {
  if (loaded || !measurementId) return;
  loaded = true;
  window[`ga-disable-${measurementId}`] = false;
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", measurementId, { anonymize_ip: true, send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);
}

/** Records the visitor's choice. Saying yes starts analytics; saying no stops it and removes Google's cookies. */
export function setConsent(choice: Consent, storage: Pick<Storage, "setItem"> = window.localStorage): void {
  try {
    storage.setItem(CONSENT_KEY, choice);
  } catch {
    // choice just won't be remembered
  }
  if (!measurementId) return;
  if (choice === "granted") {
    load();
    trackPage(window.location.hash);
  } else {
    window[`ga-disable-${measurementId}`] = true;
    for (const cookie of document.cookie.split(";")) {
      const name = cookie.split("=")[0].trim();
      if (name === "_ga" || name.startsWith("_ga_")) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
  }
}

/** Starts analytics on a later visit, if the visitor already said yes. */
export function startIfConsented(): void {
  if (analyticsAvailable && readConsent() === "granted") load();
}

/** Reports that a tab was opened (a no-op unless analytics is on). */
export function trackPage(hash: string): void {
  if (!measurementId || readConsent() !== "granted" || !window.gtag) return;
  window.gtag("event", "page_view", { page_path: pagePathFor(hash), page_title: document.title });
}
