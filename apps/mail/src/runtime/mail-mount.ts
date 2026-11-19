import { createBasePath } from '@tuturuuu/start-bridge/base-path';
import {
  type AppMountConfig,
  resolveAppBase,
} from '@tuturuuu/start-bridge/mounts';
import { invalidMailDeploymentProfile } from './deployment-profile';

// Each artifact serves only its own environment's host. The profile is a
// build-time literal (see vite.config.ts), so the other lists fold away. There
// is no default profile. Production also serves any other host at the root
// (preview and rollback hosts); staging rejects every host but its own.
export const mailMounts = {
  app: 'mail',
  rootHosts:
    process.env.MAIL_DEPLOYMENT_PROFILE === 'production'
      ? ['mail.tuturuuu.com']
      : process.env.MAIL_DEPLOYMENT_PROFILE === 'staging'
        ? ['mail.tutur3u.com']
        : process.env.MAIL_DEPLOYMENT_PROFILE === 'development'
          ? ['mail.tuturuuu.localhost', 'localhost:7820', '127.0.0.1:7820']
          : invalidMailDeploymentProfile(),
  mountHosts:
    process.env.MAIL_DEPLOYMENT_PROFILE === 'staging'
      ? []
      : ['tuturuuu.com', 'web.tutur3u.com'],
  basePath: '/mail',
  unknownHost:
    process.env.MAIL_DEPLOYMENT_PROFILE === 'staging' ? 'reject' : 'root',
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

/** True when the request targets one of this artifact's own root or mount hosts. */
export function isOwnMailHost(request: Request) {
  const { host } = new URL(request.url);
  return (
    (mailMounts.rootHosts as readonly string[]).includes(host) ||
    (mailMounts.mountHosts as readonly string[]).includes(host)
  );
}
