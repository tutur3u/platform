import { describe, expect, it, vi } from 'vitest';
import {
  reserveSenderContactOperation,
  senderContactStorageKey,
} from './sender-contact-operation';

const UUID = 'b0abbf4c-f289-49ab-8b7a-26aed0a643d6';
function storage() {
  const records = new Map<string, string>();
  return {
    records,
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => {
      records.set(key, value);
    },
  };
}

describe('Mail contact operation fence', () => {
  it('scopes browser records by actor, workspace and normalized address without plaintext email keys', () => {
    const key = senderContactStorageKey(
      'actor',
      'workspace',
      'SENDER@example.com'
    );
    expect(key).toBe(
      senderContactStorageKey('actor', 'workspace', ' sender@example.com ')
    );
    expect(key).not.toContain('@');
    expect(key).not.toBe(
      senderContactStorageKey('other', 'workspace', 'sender@example.com')
    );
    expect(key).not.toBe(
      senderContactStorageKey('actor', 'other', 'sender@example.com')
    );
  });

  it('reserves durably before submission and reuses the existing token on reopen', () => {
    const state = storage();
    const random = vi.fn(() => UUID);
    expect(reserveSenderContactOperation(state, 'key', random)).toEqual({
      kind: 'new',
      operationId: UUID,
    });
    expect(state.records.get('key')).toBe(UUID);
    expect(reserveSenderContactOperation(state, 'key', random)).toEqual({
      kind: 'existing',
      operationId: UUID,
    });
    expect(random).toHaveBeenCalledTimes(1);
  });

  it('fails closed on corrupt or unavailable storage instead of replacing a possibly submitted operation', () => {
    const state = storage();
    state.records.set('key', 'corrupt');
    const random = vi.fn(() => UUID);
    expect(() => reserveSenderContactOperation(state, 'key', random)).toThrow();
    expect(random).not.toHaveBeenCalled();
    expect(state.records.get('key')).toBe('corrupt');
    expect(() =>
      reserveSenderContactOperation(
        {
          getItem: () => null,
          setItem: () => {
            throw new Error('storage unavailable');
          },
        },
        'key',
        random
      )
    ).toThrow();
  });
});
