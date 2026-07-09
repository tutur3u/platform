export const TUTURUUU_PORTLESS_ROOT_HOST = 'tuturuuu.localhost';
export const TUTURUUU_PORTLESS_ROOT_ORIGIN = `https://${TUTURUUU_PORTLESS_ROOT_HOST}`;
export const TUTURUUU_PORTLESS_ALLOWED_DEV_ORIGINS = [
  TUTURUUU_PORTLESS_ROOT_HOST,
  `*.${TUTURUUU_PORTLESS_ROOT_HOST}`,
] as const;

export const TUTURUUU_PORTLESS_APP_ORIGINS = {
  apps: `https://apps.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  calendar: `https://calendar.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  chat: `https://chat.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  cms: `https://cms.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  docs: `https://docs.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  drive: `https://drive.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  external: `https://external.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  finance: `https://finance.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  hive: `https://hive.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  'hive-realtime': `https://realtime.hive.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  infra: `https://infra.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  inventory: `https://inventory.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  learn: `https://learn.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  mail: `https://mail.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  meet: `https://meet.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  mind: `https://mind.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  nova: `https://nova.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  pay: `https://pay.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  platform: TUTURUUU_PORTLESS_ROOT_ORIGIN,
  playground: `https://playground.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  qr: `https://qr.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  rewise: `https://rewise.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  tools: `https://tools.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  shortener: `https://shortener.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  storefront: `https://storefront.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  'tanstack-web': `https://tanstack.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  tasks: `https://tasks.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  teach: `https://teach.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  track: `https://track.${TUTURUUU_PORTLESS_ROOT_HOST}`,
} as const;

export type TuturuuuPortlessAppName =
  keyof typeof TUTURUUU_PORTLESS_APP_ORIGINS;

export const TUTURUUU_PORTLESS_APP_HOSTS = Object.fromEntries(
  Object.entries(TUTURUUU_PORTLESS_APP_ORIGINS).map(([appName, origin]) => [
    appName,
    new URL(origin).hostname,
  ])
) as {
  [K in TuturuuuPortlessAppName]: string;
};

function getPortlessWorktreePrefix(portlessUrl?: string) {
  if (!portlessUrl) {
    return null;
  }

  let hostname: string;

  try {
    hostname = new URL(portlessUrl).hostname;
  } catch {
    return null;
  }

  for (const baseHost of Object.values(TUTURUUU_PORTLESS_APP_HOSTS).sort(
    (a, b) => b.length - a.length
  )) {
    if (hostname === baseHost) {
      return null;
    }

    const suffix = `.${baseHost}`;

    if (!hostname.endsWith(suffix)) {
      continue;
    }

    const prefix = hostname.slice(0, -suffix.length);

    if (prefix && !prefix.includes('.')) {
      return prefix;
    }
  }

  return null;
}

function getPortlessHostname(portlessUrl?: string) {
  if (!portlessUrl) {
    return null;
  }

  try {
    return new URL(portlessUrl).hostname;
  } catch {
    return null;
  }
}

export function getTuturuuuPortlessAllowedDevOrigins(
  portlessUrl = process.env.PORTLESS_URL
) {
  const portlessHostname = getPortlessHostname(portlessUrl);
  const origins: string[] = [...TUTURUUU_PORTLESS_ALLOWED_DEV_ORIGINS];

  if (
    portlessHostname &&
    (portlessHostname === TUTURUUU_PORTLESS_ROOT_HOST ||
      portlessHostname.endsWith(`.${TUTURUUU_PORTLESS_ROOT_HOST}`))
  ) {
    origins.push(portlessHostname);
  }

  return Array.from(new Set(origins));
}

export function getTuturuuuPortlessAppOrigin(
  appName: TuturuuuPortlessAppName,
  options: {
    portlessUrl?: string;
  } = {}
) {
  const host = TUTURUUU_PORTLESS_APP_HOSTS[appName];
  const prefix = getPortlessWorktreePrefix(
    options.portlessUrl ?? process.env.PORTLESS_URL
  );

  return `https://${prefix ? `${prefix}.${host}` : host}`;
}
