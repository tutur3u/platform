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
 * A self-contained script that applies this device's stored Sorbet values to
 * `<html>` before the first paint, so a page opens in Sorbet instead of
 * switching after hydration. It only reads local storage, embeds no request or
 * user data, and sets attributes only to allowlisted values; anything else is
 * ignored. `ExperimentalUiSync` still applies the account values afterwards.
 */
export const SORBET_PRE_PAINT_SCRIPT = `(function(){try{var d=document.documentElement,s=window.localStorage;if(s.getItem(${JSON.stringify(
  SORBET_UI_STORAGE_KEY
)})==="true")d.setAttribute(${JSON.stringify(
  SORBET_UI_ATTRIBUTE
)},${JSON.stringify(SORBET_UI_VALUE)});var r=s.getItem(${JSON.stringify(
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
  "'sha256-b4rMjbrav58KhIKM3K8HyTGBhMHEyJQK/CJiIAjbJJU='";
