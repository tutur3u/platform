import { MIND_APP_URL } from '@/constants/common';

export function createMindPublicUrl(path = '/', request?: Request) {
  const base =
    request && process.env.NODE_ENV !== 'production'
      ? new URL(request.url).origin
      : MIND_APP_URL;

  return new URL(path, base);
}
