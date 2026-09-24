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
    value: invite,
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
