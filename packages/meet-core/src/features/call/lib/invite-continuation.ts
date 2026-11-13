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

// A fixed prefix keeps locale and notes flags out of URL/JSON cookie syntax.
function compactMeetInvite(invite: string) {
  const url = new URL(invite, 'https://meet.invalid');
  const segments = url.pathname.split('/');
  const locale = segments[1] === 'vi' ? 'v' : segments[1] === 'en' ? 'e' : 'n';
  return `m${locale}${url.searchParams.get('notes') === '1' ? '1' : '0'}${segments.at(-1)}`;
}

export function rememberMeetInvite(req: NextRequest, response: NextResponse) {
  const invite = normalizeMeetInvite(
    `${req.nextUrl.pathname}${req.nextUrl.search}`
  );
  if (invite)
    response.cookies.set(MEET_INVITE_COOKIE, compactMeetInvite(invite), {
      httpOnly: true,
      secure: req.nextUrl.protocol === 'https:',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 60,
    });
  return response;
}

export function pendingMeetInvite(req: NextRequest) {
  const value = req.cookies.get(MEET_INVITE_COOKIE)?.value;
  const compact = value?.match(/^m([nev])([01])([A-Za-z0-9-]+)$/u);
  if (!compact) return normalizeMeetInvite(value);
  const locale = compact[1] === 'v' ? '/vi' : compact[1] === 'e' ? '/en' : '';
  return normalizeMeetInvite(
    `${locale}/r/${compact[3]}${compact[2] === '1' ? '?notes=1' : ''}`
  );
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
