import type { AppMountConfig } from '@tuturuuu/start-bridge/mounts';

export interface MeetPublicOrigins {
  APP_ORIGIN?: string;
  TUTURUUU_NOINDEX?: string;
  APP_BASE_PATH?: string;
  NEXT_PUBLIC_APP_URL?: string;
}

export function meetMounts(env: MeetPublicOrigins = {}): AppMountConfig {
  return {
    app: 'meet',
    rootHosts: [
      new URL(env.NEXT_PUBLIC_APP_URL ?? 'https://meet.tuturuuu.com').host,
    ],
    mountHosts: [new URL(env.APP_ORIGIN ?? 'https://tuturuuu.com').host],
    basePath: env.APP_BASE_PATH ?? '/meet',
  };
}

export function meetDocumentOrigin(
  mode: 'root' | 'mounted',
  env: MeetPublicOrigins
) {
  return new URL(
    mode === 'mounted'
      ? (env.APP_ORIGIN ?? 'https://tuturuuu.com')
      : (env.NEXT_PUBLIC_APP_URL ?? 'https://meet.tuturuuu.com')
  ).origin;
}

export function isMeetStagingCanonical(
  request: Request,
  env: MeetPublicOrigins
) {
  return (
    env.TUTURUUU_NOINDEX === '1' &&
    [...meetMounts().rootHosts, ...meetMounts().mountHosts].some((host) =>
      [host, `www.${host}`].includes(new URL(request.url).host)
    )
  );
}
