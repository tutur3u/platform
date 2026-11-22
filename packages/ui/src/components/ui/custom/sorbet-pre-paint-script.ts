import { FOCUS_MODALITY_SCRIPT } from './focus-modality';
import { NAV_LABELS_SCRIPT } from './nav-labels';
import {
  SORBET_DENSITIES,
  SORBET_FONTS,
  SORBET_PRESETS,
  SORBET_RADII,
  SORBET_THEME_STORAGE_KEY,
} from './sorbet-theme';
import {
  SORBET_UI_ATTRIBUTE,
  SORBET_UI_STORAGE_KEY,
  SORBET_UI_VALUE,
} from './sorbet-ui';

/** Longest stored theme the script reads, matching `parseSorbetTheme`. */
const MAX_STORED_LENGTH = 512;

/**
 * `[attribute, field, allowlist]` per theme option. The first allowlist entry
 * is the default, which leaves its attribute absent, as `applySorbetTheme` does.
 */
const THEME_OPTIONS: ReadonlyArray<
  readonly [string, string, readonly string[]]
> = [
  ['data-sorbet-preset', 'preset', SORBET_PRESETS],
  ['data-sorbet-radius', 'radius', SORBET_RADII],
  ['data-sorbet-density', 'density', SORBET_DENSITIES],
  ['data-sorbet-font', 'font', SORBET_FONTS],
];

/**
 * A self-contained script that prepares `<html>` before the first paint:
 * - records the input modality, so focus rings follow keyboard navigation only
 *   (`focus-modality.ts`);
 * - applies this device's stored sidebar label choice (`nav-labels.ts`);
 * - applies Sorbet unless this device stored an explicit opt-out ("false"),
 *   even when storage is unavailable, plus the stored Sorbet theme, so a page
 *   opens in the right design instead of switching after hydration.
 * It only reads local storage and input events, embeds no request or user data,
 * and sets attributes only to allowlisted values; anything else is ignored.
 * Each part fails on its own. `ExperimentalUiSync` still applies the account
 * values afterwards.
 */
export const SORBET_PRE_PAINT_SCRIPT = `(function(){try{${FOCUS_MODALITY_SCRIPT}}catch(e){}try{${NAV_LABELS_SCRIPT}}catch(e){}try{var d=document.documentElement,s=null,u=null;try{s=window.localStorage;u=s.getItem(${JSON.stringify(
  SORBET_UI_STORAGE_KEY
)})}catch(e){}if(u!=="false")d.setAttribute(${JSON.stringify(
  SORBET_UI_ATTRIBUTE
)},${JSON.stringify(SORBET_UI_VALUE)});if(!s)return;var r=s.getItem(${JSON.stringify(
  SORBET_THEME_STORAGE_KEY
)});if(!r||r.length>${MAX_STORED_LENGTH})return;var t=JSON.parse(r);if(!t||typeof t!=="object"||Array.isArray(t))return;var o=${JSON.stringify(
  THEME_OPTIONS
)};for(var i=0;i<o.length;i++){var v=t[o[i][1]];if(typeof v==="string"&&o[i][2].indexOf(v)>0)d.setAttribute(o[i][0],v);}}catch(e){}})();`;

/**
 * CSP source for `SORBET_PRE_PAINT_SCRIPT`, for responses without a per-request
 * nonce (such as a static shell). Allow the script by this hash, never with
 * 'unsafe-inline'. A test recomputes it, so any edit to the script fails until
 * this value and every policy that uses it are updated.
 */
export const SORBET_PRE_PAINT_SCRIPT_HASH =
  "'sha256-Jk7sEJV41YvyAb8btKlJPI92W/JyOlzyajZhw5DVQZM='";
