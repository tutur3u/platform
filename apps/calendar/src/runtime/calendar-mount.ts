import { createBasePath } from '@tuturuuu/start-bridge/base-path';
import {
  type AppMountConfig,
  resolveAppBase,
} from '@tuturuuu/start-bridge/mounts';
import appConfig from '../../start-bridge.config';
// Explicit annotation: the inferred spread type would name the start-bridge
// internal MountIsolationConfig, which declaration emit cannot reference (TS2883).
export const calendarMounts: AppMountConfig = {
  app: 'calendar',
  rootHosts: [],
  basePath: '/calendar',
  ...appConfig.mounts,
};
export function calendarBase(url: URL) {
  const mount = resolveAppBase(url, calendarMounts);
  return mount
    ? createBasePath({ app: 'calendar', basePath: mount.basePath })
    : null;
}
