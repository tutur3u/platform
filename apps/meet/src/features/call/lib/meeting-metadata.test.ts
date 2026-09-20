import { expect, it } from 'vitest';
import { meetingMetadata } from './meeting-metadata';
import { encodeRoomCode } from './room-code';

const id = '00000000-0000-4000-8000-000000000001';
const copy = {
  title: 'Meeting',
  privateDescription: 'Join a meeting.',
  join: 'Join on Meet.',
  ended: 'Meeting ended.',
};
it('keeps unknown and private meetings generic and out of search indexes', () => {
  const metadata = meetingMetadata(id, 'en', null, copy);
  expect(metadata.title).toBe('Meeting');
  expect(metadata.robots).toMatchObject({
    index: false,
    googleBot: { index: false },
  });
  expect(metadata.alternates?.canonical).toBe(
    `https://meet.tuturuuu.com/r/${encodeRoomCode(id)}`
  );
});
it('publishes approved title once and status without guessing the recipient timezone', () => {
  const metadata = meetingMetadata(
    id,
    'vi',
    { title: 'Public demo', scheduledAt: '2026-09-15T12:00:00Z', ended: true },
    copy
  );
  expect(metadata.title).toBe('Public demo');
  expect(metadata.description).not.toContain('UTC');
  expect(metadata.description).not.toContain('Public demo');
  expect(metadata.openGraph).toMatchObject({
    images: [
      {
        url: `https://meet.tuturuuu.com/vi/r/${encodeRoomCode(id)}/preview?lang=vi`,
      },
    ],
  });
  expect(metadata.description).toContain('Meeting ended.');
  expect(metadata.robots).toMatchObject({
    index: true,
    googleBot: { index: true },
  });
  expect(metadata.alternates?.canonical).toBe(
    `https://meet.tuturuuu.com/vi/r/${encodeRoomCode(id)}`
  );
  expect(metadata.openGraph).toMatchObject({
    title: 'Public demo',
    locale: 'vi_VN',
  });
});
