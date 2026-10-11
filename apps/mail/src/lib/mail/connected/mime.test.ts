import PostalMime from 'postal-mime';
import { describe, expect, it } from 'vitest';
import { buildMime, composeSchema } from './mime';

const payload = composeSchema.parse({
  requestId: '3b83b485-f740-4e43-9966-a9a63b792a9c',
  to: ['recipient@example.test'],
  subject: 'Tiếng Việt — reply',
  text: 'Hello\nUnicode ü',
  inReplyTo: '<parent@example.test>',
  references: ['<root@example.test>', '<parent@example.test>'],
});
describe('Gmail and Outlook MIME transport', () => {
  it('round-trips Unicode, recipients, threading and attachment bytes', async () => {
    const raw = buildMime(
      'sender@example.test',
      { ...payload, cc: ['cc@example.test'], bcc: ['private@example.test'] },
      [
        {
          filename: 'báo cáo.pdf',
          contentType: 'application/pdf',
          content: new Uint8Array([0, 128, 255]),
        },
      ]
    );
    const message = await PostalMime.parse(raw);
    expect(message.subject).toBe(payload.subject);
    expect(message.text?.trim()).toBe(payload.text);
    expect(message.inReplyTo).toBe(payload.inReplyTo);
    expect(message.references).toBe(
      '<root@example.test> <parent@example.test>'
    );
    expect(message.attachments[0]?.filename).toBe('báo cáo.pdf');
    expect(
      Array.from(new Uint8Array(message.attachments[0]!.content as ArrayBuffer))
    ).toEqual([0, 128, 255]);
  });
  it('retains scheduling content type and method for all RSVP responses', async () => {
    const raw = buildMime('sender@example.test', payload, [
      {
        filename: 'reply.ics',
        contentType: 'text/calendar; charset=UTF-8; method=REPLY',
        content: new TextEncoder().encode(
          'BEGIN:VCALENDAR\r\nMETHOD:REPLY\r\nEND:VCALENDAR'
        ),
      },
    ]);
    expect(raw.toString()).toContain(
      'text/calendar; charset=UTF-8; method=REPLY'
    );
    expect((await PostalMime.parse(raw)).attachments).toHaveLength(1);
  });
  it.each([
    { subject: 'Hello\r\nBcc: attacker@example.test' },
    { inReplyTo: '<x>\r\nX-Foo: bar' },
    { to: ['x@example.test\nBcc: y@example.test'] },
  ])('rejects header injection', (override) => {
    expect(() =>
      buildMime('sender@example.test', { ...payload, ...override })
    ).toThrow();
  });
  it('rejects missing recipients and excessive recipient counts', () => {
    expect(composeSchema.safeParse({ ...payload, to: [] }).success).toBe(false);
    expect(
      composeSchema.safeParse({
        ...payload,
        to: Array(50).fill('x@example.test'),
        cc: ['other@example.test'],
      }).success
    ).toBe(false);
  });
});

it('rejects inline attachment identity header injection', () => {
  expect(() =>
    buildMime('sender@example.test', payload, [
      {
        filename: 'inline.png',
        contentType: 'image/png',
        content: new Uint8Array(),
        contentId: '<x>\r\nBcc: bad@example.test',
      },
    ])
  ).toThrow('Invalid attachment content identity');
});

it('bounds combined forwarded attachment bytes before allocating encoded MIME', () => {
  const file = {
    filename: 'large.bin',
    contentType: 'application/octet-stream',
    content: new Uint8Array(11 * 1024 * 1024),
  };
  expect(() => buildMime('sender@example.test', payload, [file, file])).toThrow(
    expect.objectContaining({ status: 413 })
  );
});
