/**
 * Experimental Sorbet design switch.
 *
 * The preference is stored on the user's account (`EXPERIMENTAL_SORBET_UI` in
 * user configs) so every Tuturuuu app follows it. Each app applies it by setting
 * `data-ui="sorbet"` on `<html>`; `sorbet.css` maps the Sorbet tokens onto the
 * shared semantic tokens under that attribute. A device-local copy lets the next
 * page load apply the last known value before the account value arrives.
 */

/** User config key (in `user_configs`) for the account-wide opt-in. */
export const EXPERIMENTAL_SORBET_UI_CONFIG_ID = 'EXPERIMENTAL_SORBET_UI';
export const SORBET_UI_ATTRIBUTE = 'data-ui';
export const SORBET_UI_VALUE = 'sorbet';
export const SORBET_UI_STORAGE_KEY = 'tuturuuu:experimental-sorbet-ui';
/** Fired on `window` when this tab changes the preference. */
export const SORBET_UI_CHANGE_EVENT = 'tuturuuu:experimental-sorbet-ui-change';

export function parseSorbetUiValue(value: unknown): boolean {
  return value === true || value === 'true';
}

export function readStoredSorbetUi(): boolean | null {
  try {
    const stored = window.localStorage.getItem(SORBET_UI_STORAGE_KEY);
    if (stored === null) return null;
    return stored === 'true';
  } catch {
    return null;
  }
}

function storeSorbetUi(enabled: boolean) {
  try {
    window.localStorage.setItem(
      SORBET_UI_STORAGE_KEY,
      enabled ? 'true' : 'false'
    );
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the
    // account value still applies once it loads.
  }
}

/** Applies the preference to the document and remembers it on this device. */
export function applySorbetUi(
  enabled: boolean,
  root: HTMLElement = document.documentElement
) {
  if (enabled) {
    root.setAttribute(SORBET_UI_ATTRIBUTE, SORBET_UI_VALUE);
  } else if (root.getAttribute(SORBET_UI_ATTRIBUTE) === SORBET_UI_VALUE) {
    root.removeAttribute(SORBET_UI_ATTRIBUTE);
  }
  storeSorbetUi(enabled);
}

/** Applies the preference and tells other listeners in this tab. */
export function announceSorbetUi(enabled: boolean) {
  applySorbetUi(enabled);
  window.dispatchEvent(
    new CustomEvent<boolean>(SORBET_UI_CHANGE_EVENT, { detail: enabled })
  );
}
