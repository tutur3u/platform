import { createBasePath } from '@tuturuuu/start-bridge/base-path';
import {
  type AppMountConfig,
  resolveAppBase,
} from '@tuturuuu/start-bridge/mounts';
import { invalidMailDeploymentProfile } from './deployment-profile';

// Machine traffic on the root host: server functions, the RUM beacon and the
// handoff return from Web's login. The one-origin redirect never moves these.
export const mailMachinePathPrefixes = [
  '/_fn',
  '/_mail',
  '/_rum',
  '/verify-token',
  '/en/verify-token',
  '/vi/verify-token',
] as const;

// Cookies Mail itself owns on the mount: the locale, the sidebar preferences
// and the connected-account OAuth state (set and cleared by the callback).
export const mailOwnedCookies = [
  'NEXT_LOCALE',
  'sidebar-behavior',
  'sidebar-collapsed',
  'mail_oauth_state',
] as const;

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
  // Same-origin isolation on tuturuuu.com/mail: Mail code receives an
  // access-token-only Supabase session (no refresh token, so it can verify the
  // user but never rotate or clear the shared session), the logout fence and
  // these cookies only, and writes only these, host-only at Path=/mail. Web
  // alone refreshes and ends the shared session.
  isolation: { ownedCookies: mailOwnedCookies },
  machinePathPrefixes: mailMachinePathPrefixes,
  unknownHost:
    process.env.MAIL_DEPLOYMENT_PROFILE === 'staging' ? 'reject' : 'root',
} satisfies AppMountConfig;

// The production artifact serves unknown preview and rollback hosts at the
// root, but never a staging-domain host it does not explicitly mount (N8/N9).
const stagingDomainSuffix =
  process.env.MAIL_DEPLOYMENT_PROFILE === 'production' ? '.tutur3u.com' : null;

function isForeignEnvironmentHost(host: string) {
  return (
    stagingDomainSuffix !== null &&
    host.endsWith(stagingDomainSuffix) &&
    !(mailMounts.mountHosts as readonly string[]).includes(host)
  );
}

export function mailAppPath(request: Request) {
  const url = new URL(request.url);
  if (isForeignEnvironmentHost(url.host)) return null;
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
