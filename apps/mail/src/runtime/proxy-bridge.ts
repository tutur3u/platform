import {
  dispatchThroughProxy,
  type ProxyBridgeOptions,
} from '@tuturuuu/start-bridge/proxy-bridge';
import { appBasePath } from '@tuturuuu/start-bridge/start/base-path';
import { MAIL_PROXY_MATCHER } from '../proxy-matcher';

export function proxyMatches(pathname: string) {
  return new RegExp(`^${MAIL_PROXY_MATCHER}$`, 'u').test(pathname);
}

export function dispatchThroughMailProxy(
  options: Omit<ProxyBridgeOptions, 'matches' | 'basePath'>
) {
  return dispatchThroughProxy({
    ...options,
    matches: proxyMatches,
    basePath: appBasePath(),
  });
}
