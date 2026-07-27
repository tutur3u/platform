import { BASE_URL } from '@/constants/common';

export function createAiPublicUrl(path = '/', request?: Request) {
  const base =
    request && process.env.NODE_ENV !== 'production'
      ? new URL(request.url).origin
      : BASE_URL;

  return new URL(path, base);
}
