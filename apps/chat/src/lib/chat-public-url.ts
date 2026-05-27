import { CHAT_APP_URL } from '@/constants/common';

export function createChatPublicUrl(path = '/', request?: Request) {
  const base =
    request && process.env.NODE_ENV !== 'production'
      ? new URL(request.url).origin
      : CHAT_APP_URL;

  return new URL(path, base);
}
