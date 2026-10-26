import { createBasePath } from '@tuturuuu/start-bridge/base-path';
import {
  type AppMountConfig,
  resolveAppBase,
} from '@tuturuuu/start-bridge/mounts';
export const calendarMounts = {
  app: 'calendar',
  rootHosts: ['calendar.tuturuuu.com'],
  mountHosts: ['tuturuuu.com', 'staging.tuturuuu.com'],
  basePath: '/calendar',
} satisfies AppMountConfig;
export function calendarBase(url: URL) {
  const mount = resolveAppBase(url, calendarMounts);
  return mount
    ? createBasePath({ app: 'calendar', basePath: mount.basePath })
    : null;
}
