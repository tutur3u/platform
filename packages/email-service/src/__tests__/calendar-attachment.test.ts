import { expect, it } from 'vitest';
import { emailAttachmentSchema } from '../validation';

const file = { filename: 'reply.ics', data: new Uint8Array([1, 2, 3]) };
it('permits scheduling calendar MIME parameters required by iTIP transport', () => {
  const contentType = 'text/calendar; charset=UTF-8; method=REPLY';
  expect(
    emailAttachmentSchema.parse({ ...file, contentType }).contentType
  ).toBe(contentType);
});
it.each([
  'text/calendar; method=REPLY\r\nBcc: other@example.test',
  'text/calendar;\r\nmethod=REPLY',
  'text/calendar; method="REPLY"',
  'image/png; method=REPLY',
  'text/calendar; charset=UTF-8; method=REPLY; boundary=unsafe',
])('rejects unsafe or unsupported parameterization %s', (contentType) => {
  expect(
    emailAttachmentSchema.safeParse({ ...file, contentType }).success
  ).toBe(false);
});
