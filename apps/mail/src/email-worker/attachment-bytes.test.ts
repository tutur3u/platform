import { runInNewContext } from 'node:vm';
import PostalMime from 'postal-mime';
import { expect, it } from 'vitest';
import { attachmentBytes } from './index';

it('preserves foreign-realm typed-array bytes instead of serializing decimal text', () => {
  const content = runInNewContext('new Uint8Array([66,69,71,73,78])');
  expect(content instanceof Uint8Array).toBe(false);
  expect(Array.from(attachmentBytes({ content } as never))).toEqual([
    66, 69, 71, 73, 78,
  ]);
});

it('keeps Google multipart/alternative text/calendar raw through actual PostalMime and worker normalization', async () => {
  const calendar =
    'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nMETHOD:REQUEST\r\nEND:VCALENDAR\r\n';
  const raw = [
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="google"',
    '',
    '--google',
    'Content-Type: text/plain',
    '',
    'Invitation',
    '--google',
    'Content-Type: text/calendar; charset=UTF-8; method=REQUEST',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(calendar).toString('base64'),
    '--google--',
    '',
  ].join('\r\n');
  const email = await PostalMime.parse(raw, {
    attachmentEncoding: 'arraybuffer',
  });
  expect(email.attachments).toHaveLength(1);
  expect(email.attachments[0]!.mimeType).toBe('text/calendar');
  expect(new TextDecoder().decode(attachmentBytes(email.attachments[0]!))).toBe(
    calendar.replaceAll('\r\n', '\n')
  );
});
