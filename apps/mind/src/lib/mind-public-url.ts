import {
  prefixBase,
  trimTrailingSlashes,
} from '@tuturuuu/start-bridge/base-path';
import { BASE_URL } from '@/constants/common';

export function createMindPublicUrl(path = '/', request?: Request) {
  if (
    !path.startsWith('/') ||
    path.startsWith('//') ||
    /[\\\u0000-\u0020]/u.test(path)
  ) {
    throw new Error('Expected an app-relative Mind path');
  }

  const base = new URL(
    request && process.env.NODE_ENV !== 'production'
      ? new URL(request.url).origin
      : BASE_URL
  );
  const basePath = trimTrailingSlashes(base.pathname);
  const url = new URL(prefixBase(path, basePath), base.origin);
  url.pathname = trimTrailingSlashes(url.pathname) || '/';

  let decodedPath = url.pathname;
  for (let depth = 0; depth < 5; depth += 1) {
    if (
      url.origin !== base.origin ||
      (basePath &&
        decodedPath !== basePath &&
        !decodedPath.startsWith(`${basePath}/`)) ||
      /[\\\u0000-\u0020]/u.test(decodedPath)
    ) {
      throw new Error('Mind path must stay within its app base');
    }
    let decoded: string;
    try {
      decoded = decodeURIComponent(decodedPath);
    } catch {
      return url;
    }
    const parsed = new URL(decoded, base.origin);
    // URL parsing turns a decoded backslash into `/`; refuse it before then.
    if (parsed.origin !== base.origin || decoded.includes('\\')) {
      throw new Error('Mind path must stay within its app base');
    }
    if (decoded === decodedPath) return url;
    decodedPath = parsed.pathname;
  }
  throw new Error('Mind path exceeds the URL encoding limit');
}
