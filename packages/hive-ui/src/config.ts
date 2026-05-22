import { getTuturuuuPortlessAppOrigin } from '@tuturuuu/utils/portless';

export function resolveHiveRealtimeUrl(env: NodeJS.ProcessEnv = process.env) {
  const configured = env.NEXT_PUBLIC_HIVE_REALTIME_URL ?? env.HIVE_REALTIME_URL;

  if (configured) {
    return configured;
  }

  const origin = getTuturuuuPortlessAppOrigin('hive-realtime').replace(
    /^http/u,
    'ws'
  );

  return `${origin}/realtime`;
}

export const HIVE_REALTIME_URL = resolveHiveRealtimeUrl();
