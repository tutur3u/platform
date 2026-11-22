import type { AppSessionTargetApp } from '@tuturuuu/auth/app-session';
import { getSupabaseSessionUser } from '@tuturuuu/auth/supabase-session-user';
import type { SignedInLoaderTiming } from '@tuturuuu/utils/signed-in-loader-timing';
import { headers } from 'next/headers';
import {
  getSatelliteAppSessionFromRequest,
  getSatelliteAppSessionUserFromRequest,
  getSatelliteCurrentUserFromRequest,
} from './auth-request';

export async function getSatelliteSupabaseSessionUser() {
  return getSupabaseSessionUser();
}

async function requestOptions(targetApp?: AppSessionTargetApp) {
  return {
    request: { headers: await headers() },
    targetApp,
    getSupabaseSessionUser: getSatelliteSupabaseSessionUser,
  };
}

export async function getSatelliteAppSession(targetApp?: AppSessionTargetApp) {
  return getSatelliteAppSessionFromRequest(await requestOptions(targetApp));
}

export async function getSatelliteAppSessionUser(
  targetApp?: AppSessionTargetApp
) {
  return getSatelliteAppSessionUserFromRequest(await requestOptions(targetApp));
}

export async function getSatelliteCurrentUser(
  targetApp?: AppSessionTargetApp,
  timing?: SignedInLoaderTiming
) {
  return getSatelliteCurrentUserFromRequest({
    ...(await requestOptions(targetApp)),
    timing,
  });
}
