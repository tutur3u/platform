import { createBasePath } from '@tuturuuu/start-bridge/base-path';
import {
  type AppMountConfig,
  resolveAppBase,
} from '@tuturuuu/start-bridge/mounts';
import appConfig from '../../start-bridge.config';
export const calendarMounts = {
  app: 'calendar',
  rootHosts: [],
  basePath: '/calendar',
  ...appConfig.mounts,
} satisfies AppMountConfig;
export function calendarBase(url: URL) {
  const mount = resolveAppBase(url, calendarMounts);
  return mount
    ? createBasePath({ app: 'calendar', basePath: mount.basePath })
    : null;
}
