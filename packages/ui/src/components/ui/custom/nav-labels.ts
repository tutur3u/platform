/**
 * Sidebar navigation labels in the collapsed rail.
 *
 * The collapsed and expand-on-hover sidebars show icons only by default, with
 * each title in a tooltip and the accessible name. Users can turn the one-line
 * captions under the icons back on in Settings → Sidebar. The choice is stored
 * on the account (`SIDEBAR_NAV_LABELS` in user configs) so every app's sidebar
 * follows it. Each app applies it as `data-nav-labels="shown"` on `<html>`, and
 * the caption uses the `nav-labels:` variant from `globals.css`, so the rail
 * renders the right way before hydration.
 */

/** User config key (in `user_configs`) for the account-wide choice. */
export const SIDEBAR_NAV_LABELS_CONFIG_ID = 'SIDEBAR_NAV_LABELS';
export const NAV_LABELS_ATTRIBUTE = 'data-nav-labels';
export const NAV_LABELS_VALUE = 'shown';
export const NAV_LABELS_STORAGE_KEY = 'tuturuuu:sidebar-nav-labels';
/** Fired on `window` when this tab changes the preference. */
export const NAV_LABELS_CHANGE_EVENT = 'tuturuuu:sidebar-nav-labels-change';

export function parseNavLabelsValue(value: unknown): boolean {
  return value === true || value === 'true';
}

export function readStoredNavLabels(): boolean | null {
  try {
    const stored = window.localStorage.getItem(NAV_LABELS_STORAGE_KEY);
    if (stored === null) return null;
    return stored === 'true';
  } catch {
    return null;
  }
}

function storeNavLabels(shown: boolean) {
  try {
    window.localStorage.setItem(
      NAV_LABELS_STORAGE_KEY,
      shown ? 'true' : 'false'
    );
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the
    // account value still applies once it loads.
  }
}

/** Applies the preference to the document and remembers it on this device. */
export function applyNavLabels(
  shown: boolean,
  root: HTMLElement = document.documentElement
) {
  if (shown) {
    root.setAttribute(NAV_LABELS_ATTRIBUTE, NAV_LABELS_VALUE);
  } else {
    root.removeAttribute(NAV_LABELS_ATTRIBUTE);
  }
  storeNavLabels(shown);
}

/** Applies the preference and tells other listeners in this tab. */
export function announceNavLabels(shown: boolean) {
  applyNavLabels(shown);
  window.dispatchEvent(
    new CustomEvent<boolean>(NAV_LABELS_CHANGE_EVENT, { detail: shown })
  );
}

/** Pre-paint snippet: applies this device's stored choice before first paint. */
export const NAV_LABELS_SCRIPT = `if(window.localStorage.getItem(${JSON.stringify(
  NAV_LABELS_STORAGE_KEY
)})==="true")document.documentElement.setAttribute(${JSON.stringify(
  NAV_LABELS_ATTRIBUTE
)},${JSON.stringify(NAV_LABELS_VALUE)});`;
