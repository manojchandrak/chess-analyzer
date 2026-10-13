import { useEffect, useState, useSyncExternalStore } from "react";

/** The browser's "install this site as an app" offer (Chrome, Edge and Android; Safari has no such event). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const isInstalled = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** An "Install app" link, shown only when the browser says the site can be installed and it isn't already. */
export function InstallApp() {
  const [offer, setOffer] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isInstalled);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep the offer for our own button instead of the browser's mini-bar
      setOffer(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setOffer(null);
      setInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!offer || installed) return null;
  return (
    <button
      className="link-button"
      onClick={() => {
        void offer.prompt();
        void offer.userChoice.then(() => setOffer(null));
      }}
    >
      Install app
    </button>
  );
}

const subscribeOnline = (listener: () => void) => {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
};

/** A short note at the top while there is no connection, saying what still works. */
export function OfflineNote() {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <p className="offline-note" role="status">
      You're offline. The board, drills, engine and anything you have already reviewed still work; loading games and logging in need a connection.
    </p>
  );
}
