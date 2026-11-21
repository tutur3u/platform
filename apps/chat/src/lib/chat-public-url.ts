import { withAppBase } from '@tuturuuu/start-bridge/app-url';
import { resolveAppBase } from '@tuturuuu/start-bridge/mounts';
import appConfig from '../../start-bridge.config';
import { CHAT_APP_URL } from '@/constants/common';

export function createChatPublicUrl(path = '/', request?: Request) {
  if (request) {
    const url = new URL(request.url);
    const mount = resolveAppBase(url, {
      app: 'chat',
      rootHosts: [],
      ...appConfig.mounts,
    });
    if (mount?.mode === 'mounted')
      return new URL(withAppBase(path, mount.basePath), url.origin);
  }
  const base =
    request && process.env.NODE_ENV !== 'production'
      ? new URL(request.url).origin
      : CHAT_APP_URL;

  return new URL(path, base);
}
