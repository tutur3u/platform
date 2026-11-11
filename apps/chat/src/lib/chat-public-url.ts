import { withAppBase } from '@tuturuuu/start-bridge/app-url';
import { maybeBridgeRequest } from '@tuturuuu/start-bridge/request-context/core';
import { CHAT_APP_URL } from '@/constants/common';

export function createChatPublicUrl(path = '/', request?: Request) {
  const context = maybeBridgeRequest();
  // Only the bridge's admitted mount can select the shared origin. Never
  // derive a production redirect origin from client headers.
  if (
    context?.appBase === '/chat' &&
    new URL(context.request.url).hostname === 'tuturuuu.com'
  )
    return new URL(withAppBase(path, '/chat'), 'https://tuturuuu.com');

  const base =
    request && process.env.NODE_ENV !== 'production'
      ? new URL(request.url).origin
      : CHAT_APP_URL;

  return new URL(path, base);
}
