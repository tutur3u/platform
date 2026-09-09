import type { NextRequest, NextResponse } from 'next/server';
import { decodeRoomCode } from './room-code';

export const MEET_INVITE_COOKIE = 'meet_pending_invite';

/** Only room paths may survive an authentication handoff. Never a full URL. */
export function normalizeMeetInvite(value: string | undefined): string | null {
  if (!value?.startsWith('/') || value.startsWith('//')) return null;
  let url: URL;
  try {
    url = new URL(value, 'https://meet.invalid');
  } catch {
    return null;
  }
  if (url.origin !== 'https://meet.invalid') return null;
  const match = url.pathname.match(/^(?:\/(en|vi))?\/r\/([^/]+)$/u);
  if (!match?.[2] || !decodeRoomCode(match[2])) return null;
  return `${url.pathname}${url.searchParams.get('notes') === '1' ? '?notes=1' : ''}`;
}

export function rememberMeetInvite(req: NextRequest, response: NextResponse) {
  const invite = normalizeMeetInvite(
    `${req.nextUrl.pathname}${req.nextUrl.search}`
  );
  if (invite)
    response.cookies.set(MEET_INVITE_COOKIE, invite, {
      httpOnly: true,
      secure: req.nextUrl.protocol === 'https:',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 60,
    });
  return response;
}

export function pendingMeetInvite(req: NextRequest) {
  return normalizeMeetInvite(req.cookies.get(MEET_INVITE_COOKIE)?.value);
}

export function clearMeetInvite(response: NextResponse) {
  response.cookies.set(MEET_INVITE_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
