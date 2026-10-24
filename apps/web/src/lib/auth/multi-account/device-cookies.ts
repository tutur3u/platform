import { cookies } from 'next/headers';
import {
  createDeviceCookieValue,
  getAllDeviceCookieClearTargets,
  getDeviceCookieName,
  getDeviceCookieOptions,
  getDeviceCookieReadNames,
  getStaleDeviceCookieClearTargets,
  parseDeviceCookieValue,
} from './crypto';
import type { WebAccountDevice } from './types';

export function clearStaleDeviceCookies(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  request: Pick<Request, 'headers' | 'url'>
) {
  for (const target of getStaleDeviceCookieClearTargets(request)) {
    cookieStore.set(target.name, '', target.options);
  }
}

function getCookieHeaderValues(
  request: Pick<Request, 'headers' | 'url'>,
  name: string
) {
  const cookieHeader = request.headers.get('cookie');

  if (!cookieHeader) return [];

  return cookieHeader.split(';').flatMap((cookie) => {
    const [cookieName, ...valueParts] = cookie.trim().split('=');
    if (cookieName !== name) return [];
    const value = valueParts.join('=').trim();
    return value ? [value] : [];
  });
}

export async function getDeviceCredentialCandidates(
  request: Pick<Request, 'headers' | 'url'>
) {
  const cookieStore = await cookies();

  return getDeviceCookieReadNames(request).flatMap((cookieName) => {
    const headerValues = getCookieHeaderValues(request, cookieName);
    const values =
      headerValues.length > 0
        ? [...headerValues].reverse()
        : [cookieStore.get(cookieName)?.value].filter(Boolean);

    return values.flatMap((value) => {
      const credential = parseDeviceCookieValue(value);
      return credential ? [credential] : [];
    });
  });
}

export async function setDeviceCookie(
  request: Pick<Request, 'headers' | 'url'>,
  device: WebAccountDevice
) {
  const cookieStore = await cookies();
  const cookieName = getDeviceCookieName(request);

  clearStaleDeviceCookies(cookieStore, request);

  cookieStore.set(
    cookieName,
    createDeviceCookieValue(device.deviceId, device.secret),
    getDeviceCookieOptions(request)
  );
}

export async function clearDeviceCookie(
  request: Pick<Request, 'headers' | 'url'>
) {
  const cookieStore = await cookies();
  for (const target of getAllDeviceCookieClearTargets(request)) {
    cookieStore.set(target.name, '', target.options);
  }
}
