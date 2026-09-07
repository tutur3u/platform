export interface PwaInstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
type InstallStore = {
  prompt: PwaInstallPrompt | null;
  listeners: Set<() => void>;
};
declare global {
  interface Window {
    __tuturuuuPwaInstall?: InstallStore;
  }
}
/** Capture before hydration, retaining the one-shot prompt across component mounts. */
export function initializePwaInstall() {
  if (typeof window === 'undefined' || window.__tuturuuuPwaInstall) return;
  const store: InstallStore = { prompt: null, listeners: new Set() };
  window.__tuturuuuPwaInstall = store;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    store.prompt = event as PwaInstallPrompt;
    for (const listener of store.listeners) listener();
  });
  window.addEventListener('appinstalled', clearPwaInstallPrompt);
}
export function getPwaInstallPrompt() {
  return typeof window === 'undefined'
    ? null
    : (window.__tuturuuuPwaInstall?.prompt ?? null);
}
export function subscribePwaInstall(listener: () => void) {
  initializePwaInstall();
  const store = window.__tuturuuuPwaInstall!;
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
}
export function clearPwaInstallPrompt() {
  const store = window.__tuturuuuPwaInstall;
  if (!store) return;
  store.prompt = null;
  for (const listener of store.listeners) listener();
}
