import { NextRequest, NextResponse } from 'next/server';
import { expect, it } from 'vitest';
import {
  clearMeetInvite,
  MEET_INVITE_COOKIE,
  normalizeMeetInvite,
  pendingMeetInvite,
  rememberMeetInvite,
} from './invite-continuation';

const invite = '/r/pmfe4p67f-s4z33jjmr-vv1zmrer';

it('retains only a valid room destination and the notes preference', () => {
  expect(normalizeMeetInvite(`/vi${invite}?notes=1&token=discard`)).toBe(
    `/vi${invite}?notes=1`
  );
  for (const target of [
    'https://evil.test',
    '//evil.test',
    '/\\[invalid',
    '/login',
    '/r/invalid',
  ]) {
    expect(normalizeMeetInvite(target)).toBeNull();
  }
});

it('remembers an invite across login and consumes it once', () => {
  const request = new NextRequest(`https://meet.tuturuuu.com${invite}`);
  const handoff = rememberMeetInvite(
    request,
    NextResponse.redirect('https://tuturuuu.com/login')
  );
  const saved = handoff.cookies.get(MEET_INVITE_COOKIE);
  expect(saved).toMatchObject({
    value: `mn0${invite.slice(3)}`,
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 1800,
  });
  const returned = new NextRequest('https://meet.tuturuuu.com/', {
    headers: { cookie: `${MEET_INVITE_COOKIE}=${invite}` },
  });
  expect(pendingMeetInvite(returned)).toBe(invite);
  expect(
    clearMeetInvite(NextResponse.next()).cookies.get(MEET_INVITE_COOKIE)?.maxAge
  ).toBe(0);
});

it.each(['', '/en', '/vi'])(
  'round trips a compact host-only invite for %s',
  (locale) => {
    const target = `${locale}${invite}?notes=1`;
    const response = rememberMeetInvite(
      new NextRequest(`https://meet.tuturuuu.com${target}&discard=secret`),
      NextResponse.next()
    );
    const saved = response.cookies.get(MEET_INVITE_COOKIE);
    expect(saved?.value).toMatch(/^[a-z0-9-]+$/u);
    expect(response.headers.get('set-cookie')).not.toMatch(/Domain=/iu);
    const request = new NextRequest('https://meet.tuturuuu.com/', {
      headers: { cookie: `${MEET_INVITE_COOKIE}=${saved?.value}` },
    });
    expect(pendingMeetInvite(request)).toBe(target);
    const cleared = clearMeetInvite(response).cookies.get(MEET_INVITE_COOKIE);
    expect(cleared).toMatchObject({ path: '/', maxAge: 0 });
  }
);

it.each(['mn0invalid', 'mx1anything', 'mv1//evil.test', 'mn0'])(
  'rejects malformed compact invite %s',
  (value) => {
    const request = new NextRequest('https://meet.tuturuuu.com/', {
      headers: { cookie: `${MEET_INVITE_COOKIE}=${value}` },
    });
    expect(pendingMeetInvite(request)).toBeNull();
  }
);
