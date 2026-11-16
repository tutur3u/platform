import { expect, it } from 'vitest';
import {
  HANDOFF_PREFIX,
  HANDOFF_WINDOW_MS,
  meetMailFragment,
  meetMailUrl,
  parseMeetMailHandoff,
  type MeetMailHandoff,
} from './meet-mail-handoff';
const actorId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const value: MeetMailHandoff = {
  v: 1,
  source: 'meet',
  id: '00000000-0000-4000-8000-000000000003',
  issuedAt: Date.now(),
  actorId,
  workspaceId,
  subject: '<b>Meeting</b>',
  joinUrl: 'https://meet.tuturuuu.com/r/bwkhfrfc0-hf9ttx0m8-h9x8kmr8',
  body: '<b>Meeting</b>\nhttps://meet.tuturuuu.com/r/bwkhfrfc0-hf9ttx0m8-h9x8kmr8',
  to: ['one@example.invalid'],
};
const scope = {
  actorId,
  workspaceId,
  meetOrigin: 'https://meet.tuturuuu.com',
  now: value.issuedAt,
};
const raw = (input: unknown) =>
  HANDOFF_PREFIX + encodeURIComponent(JSON.stringify(input));
it('round trips only a bounded plain draft through fixed Mail fragment routes', () => {
  const url = new URL(meetMailUrl(value, 'vi'));
  expect(url.origin).toBe('https://mail.tuturuuu.com');
  expect(url.pathname).toBe(`/vi/${workspaceId}/inbox`);
  expect(url.search).toBe('');
  expect(url.pathname).not.toContain('example');
  expect(parseMeetMailHandoff(url.hash, scope)).toEqual(value);
});
it('normalizes/deduplicates addresses without interpreting HTML as markup', () => {
  expect(
    parseMeetMailHandoff(
      raw({ ...value, to: ['ONE@example.invalid', 'one@example.invalid'] }),
      scope
    )
  ).toEqual({ ...value, to: ['one@example.invalid'] });
});
it.each([
  { v: 2 },
  { source: 'parley' },
  { id: 'bad' },
  { actorId: workspaceId },
  { workspaceId: actorId },
  { from: 'forged@example.invalid' },
  { cc: [] },
  { bcc: [] },
  { html: '<script>x</script>' },
  { accountId: 'foreign' },
  { attachments: [] },
  { target: 'https://evil.test' },
  { subject: 'Subject\r\nBcc: bad@example.invalid' },
  { subject: 'a'.repeat(161) },
  { body: 'notes or private recording' },
  { to: ['bad\r\n@example.invalid'] },
  { to: ['\r\none@example.invalid'] },
  { to: [] },
  { to: Array(21).fill('one@example.invalid') },
  { issuedAt: value.issuedAt - HANDOFF_WINDOW_MS - 1 },
  { issuedAt: value.issuedAt + 30_001 },
  { joinUrl: 'https://evil.test/r/bwkhfrfc0-hf9ttx0m8-h9x8kmr8' },
  { joinUrl: 'https://meet.tuturuuu.com/private/recording' },
])('rejects untrusted fields, origins or scope %j', (change) => {
  expect(parseMeetMailHandoff(raw({ ...value, ...change }), scope)).toBeNull();
});
it.each([
  '#meet-mail=%ZZ',
  '#meet-mail={}',
  '#meet-mail=' + 'x'.repeat(16_385),
  '#other=1',
])('rejects malformed/oversized fragments', (fragment) => {
  expect(parseMeetMailHandoff(fragment, scope)).toBeNull();
});
it('producer rejects unknown fields as well as the receiver', () => {
  const forged = { ...value, html: 'forged' };
  expect(() => meetMailFragment(forged)).toThrow();
});

it('refuses control characters even when trimming could hide them', () => {
  expect(
    parseMeetMailHandoff(
      raw({ ...value, subject: '\r\n' + value.subject }),
      scope
    )
  ).toBeNull();
  const joinUrl = value.joinUrl + '\r\n';
  expect(
    parseMeetMailHandoff(
      raw({ ...value, joinUrl, body: `${value.subject}\n${joinUrl}` }),
      scope
    )
  ).toBeNull();
});
