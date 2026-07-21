export const themeStorageKey = 'theme';
export const supportedThemes = ['system', 'light', 'dark'] as const;

export type ThemePreference = (typeof supportedThemes)[number];

export type ThemeInitScriptOptions = {
  className?: string;
  defaultTheme?: ThemePreference;
  storageKey?: string;
};

export function normalizeThemePreference(
  value: unknown,
  fallback: ThemePreference = 'system'
): ThemePreference {
  return typeof value === 'string' &&
    supportedThemes.includes(value as ThemePreference)
    ? (value as ThemePreference)
    : fallback;
}

export function shouldUseDarkTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean
) {
  return (
    preference === 'dark' || (preference === 'system' && systemPrefersDark)
  );
}

function serializeInlineScriptValue(value: unknown) {
  return JSON.stringify(value)
    .replaceAll('&', '\\u0026')
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

export function createThemeInitScript(options: ThemeInitScriptOptions = {}) {
  const config = {
    className: options.className ?? 'dark',
    defaultTheme: options.defaultTheme ?? 'system',
    storageKey: options.storageKey ?? themeStorageKey,
  };

  return `(function(){try{var c=${serializeInlineScriptValue(config)};var r=document.documentElement;var s=localStorage.getItem(c.storageKey)||c.defaultTheme;var t=s==="light"||s==="dark"||s==="system"?s:c.defaultTheme;var m=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;var d=t==="dark"||(t==="system"&&m);r.classList.toggle(c.className,d);r.style.colorScheme=d?"dark":"light";}catch(_){}})();`;
}
