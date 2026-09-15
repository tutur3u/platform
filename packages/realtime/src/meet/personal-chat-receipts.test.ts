import { expect, it } from 'vitest';
import {
  type PersonalChatReceipts,
  personalChatReceipt,
} from './personal-chat-receipts';

const receiptId = (index: number) =>
  `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`;
const command = {
  action: 'personal.begin' as const,
  id: '11111111-1111-4111-8111-111111111111',
  startedAt: 1000,
  fingerprint: 'a'.repeat(64),
};
it('releases a confirmed unwritten pending request so its id and capacity can be reused', () => {
  let receipts: PersonalChatReceipts | undefined;
  for (let i = 0; i < 40; i++)
    receipts = personalChatReceipt(
      receipts,
      'actor',
      { ...command, id: receiptId(i) },
      1000
    ).receipts;
  expect(personalChatReceipt(receipts, 'actor', command, 1000).status).toBe(
    429
  );
  const released = personalChatReceipt(
    receipts,
    'actor',
    {
      action: 'personal.release',
      id: receiptId(0),
      fingerprint: command.fingerprint,
    },
    1000
  );
  expect(Object.keys(released.receipts.actor!)).toHaveLength(39);
  expect(
    personalChatReceipt(
      released.receipts,
      'actor',
      { ...command, id: receiptId(0) },
      1000
    ).body
  ).toEqual({ started: true });
});
it('rejects release with another fingerprint and preserves completed receipts', () => {
  const started = personalChatReceipt(undefined, 'actor', command, 1000);
  const release = {
    action: 'personal.release' as const,
    id: command.id,
    fingerprint: command.fingerprint,
  };
  expect(
    personalChatReceipt(
      started.receipts,
      'actor',
      { ...release, fingerprint: 'b'.repeat(64) },
      1000
    ).status
  ).toBe(409);
  expect(
    personalChatReceipt(started.receipts, 'other', release, 1000).receipts.actor
  ).toEqual(started.receipts.actor);
  const finished = personalChatReceipt(
    started.receipts,
    'actor',
    { action: 'personal.finish', id: command.id, text: 'saved' },
    1000
  );
  expect(
    personalChatReceipt(finished.receipts, 'actor', release, 1000).status
  ).toBe(409);
  expect(
    personalChatReceipt(finished.receipts, 'actor', command, 1000).body
  ).toEqual({ text: 'saved' });
});
