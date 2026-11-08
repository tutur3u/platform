/** `next-intl/routing` for bridged apps; the config is plain data. */
export type LocalePrefixMode = 'always' | 'as-needed' | 'never';

export interface BridgeRouting<Locales extends readonly string[]> {
  locales: Locales;
  defaultLocale: Locales[number];
  localePrefix?: LocalePrefixMode | { mode: LocalePrefixMode };
  localeCookie?: unknown;
  localeDetection?: boolean;
  alternateLinks?: boolean;
  pathnames?: Record<string, unknown>;
}

export function defineRouting<const Locales extends readonly string[]>(
  config: BridgeRouting<Locales>
) {
  return config;
}

export function hasLocale<const Locales extends readonly string[]>(
  locales: Locales,
  candidate: unknown
): candidate is Locales[number] {
  return typeof candidate === 'string' && locales.includes(candidate);
}

export function localePrefixMode(
  routing: Pick<BridgeRouting<readonly string[]>, 'localePrefix'>
): LocalePrefixMode {
  const prefix = routing.localePrefix;
  if (!prefix) return 'always';
  return typeof prefix === 'string' ? prefix : prefix.mode;
}
