/** Client locale preference; routing may disable or scope its own cookie. */
export function localeCookieAssignment(
  config: unknown,
  locale: string
): string | null {
  if (!/^[a-zA-Z0-9_-]+$/u.test(locale) || config === false) return null;
  if (config !== undefined && (!config || typeof config !== 'object'))
    return null;
  const name = config && 'name' in config ? config.name : 'NEXT_LOCALE';
  const path = config && 'path' in config ? config.path : '/';
  const secure = config && 'secure' in config ? config.secure : false;
  if (
    typeof name !== 'string' ||
    !/^[a-zA-Z0-9_-]+$/u.test(name) ||
    typeof path !== 'string' ||
    !/^\/(?:[a-zA-Z0-9/_-]*)$/u.test(path) ||
    path.startsWith('//') ||
    typeof secure !== 'boolean'
  )
    return null;
  return `${name}=${locale}; path=${path}; max-age=31536000; samesite=lax${secure ? '; secure' : ''}`;
}
