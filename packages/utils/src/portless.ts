export const TUTURUUU_PORTLESS_ROOT_HOST = 'tuturuuu.localhost';
export const TUTURUUU_PORTLESS_ROOT_ORIGIN = `https://${TUTURUUU_PORTLESS_ROOT_HOST}`;
export const TUTURUUU_PORTLESS_ALLOWED_DEV_ORIGINS = [
  TUTURUUU_PORTLESS_ROOT_HOST,
  `*.${TUTURUUU_PORTLESS_ROOT_HOST}`,
] as const;

export const TUTURUUU_PORTLESS_APP_ORIGINS = {
  apps: `https://apps.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  calendar: `https://calendar.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  cms: `https://cms.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  external: `https://external.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  finance: `https://finance.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  hive: `https://hive.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  'hive-realtime': `https://realtime.hive.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  inventory: `https://inventory.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  learn: `https://learn.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  meet: `https://meet.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  mind: `https://mind.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  nova: `https://nova.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  platform: TUTURUUU_PORTLESS_ROOT_ORIGIN,
  playground: `https://playground.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  rewise: `https://rewise.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  shortener: `https://shortener.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  tasks: `https://tasks.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  teach: `https://teach.${TUTURUUU_PORTLESS_ROOT_HOST}`,
  track: `https://track.${TUTURUUU_PORTLESS_ROOT_HOST}`,
} as const;

export type TuturuuuPortlessAppName =
  keyof typeof TUTURUUU_PORTLESS_APP_ORIGINS;

export function getTuturuuuPortlessAppOrigin(appName: TuturuuuPortlessAppName) {
  return TUTURUUU_PORTLESS_APP_ORIGINS[appName];
}
