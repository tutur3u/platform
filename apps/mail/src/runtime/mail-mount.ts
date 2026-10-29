import { createBasePath } from '@tuturuuu/start-bridge/base-path';
import {
  type AppMountConfig,
  resolveAppBase,
} from '@tuturuuu/start-bridge/mounts';

export const mailMounts = {
  app: 'mail',
  rootHosts: ['mail.tuturuuu.com'],
  mountHosts: ['tuturuuu.com', 'staging.tuturuuu.com'],
  basePath: '/mail',
} satisfies AppMountConfig;

export function mailAppPath(request: Request) {
  const url = new URL(request.url);
  const mount = resolveAppBase(url, mailMounts);
  return mount
    ? createBasePath({ app: 'mail', basePath: mount.basePath }).strip(
        url.pathname
      )
    : null;
}
