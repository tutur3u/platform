import { expect, test } from 'bun:test';
import { createHmac } from 'node:crypto';
import { canonical, mac, sha256 } from './erase-ledger';

test('canonical hash vector is independent of insertion order', async () => {
  const a = { z: [2, 1], a: { z: null, a: 1 } };
  expect(canonical(a)).toBe('{"a":{"a":1,"z":null},"z":[2,1]}');
  expect(await sha256(canonical(a))).toBe(
    await sha256(canonical({ a: { a: 1, z: null }, z: [2, 1] }))
  );
});
test('ledger and block domains use null delimiter and raw previous/block bytes', async () => {
  const raw = new Uint8Array(32).fill(7);
  const key = await crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const hash = 'ab'.repeat(32);
  const reference = createHmac('sha256', raw)
    .update('meet-erase-ledger-block/v1\0')
    .update(Buffer.from(hash, 'hex'))
    .digest('hex');
  expect(await mac(key, 'meet-erase-ledger-block/v1', hash, '')).toBe(
    reference
  );
  expect(await mac(key, 'meet-erase-ledger/v1', hash, '')).not.toBe(reference);
});

test('canonical ledger JSON rejects noncanonical numeric values', () => {
  for (const value of [NaN, Infinity, -0, 1.5, Number.MAX_SAFE_INTEGER + 1])
    expect(() => canonical(value)).toThrow('MEET_ERASE_INVALID_JSON');
});
