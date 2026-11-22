import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import {
  macEqual,
  machineMac,
  newPairingCode,
  ownerMac,
  pairingKey,
  parsePairingCode,
} from './secret-pairing.mjs';

test('codes carry 80 bits as 16 Crockford characters', () => {
  const bytes = randomBytes(10);
  const code = newPairingCode(bytes);
  assert.match(code, /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
  assert.deepEqual(parsePairingCode(code), bytes);
  assert.deepEqual(
    parsePairingCode(code.toLowerCase().replace(/-/g, ' ')),
    bytes
  );
  assert.equal(newPairingCode(Buffer.alloc(10)), '0000-0000-0000-0000');
  assert.equal(newPairingCode(Buffer.alloc(10, 0xff)), 'ZZZZ-ZZZZ-ZZZZ-ZZZZ');
  assert.throws(() => newPairingCode(Buffer.alloc(9)));
});

test('parsing reads look-alikes and refuses anything else', () => {
  assert.deepEqual(
    parsePairingCode('OOOO-IIII-LLLL-0000'),
    parsePairingCode('0000-1111-1111-0000')
  );
  assert.equal(parsePairingCode('0000-0000-0000-000'), null);
  assert.equal(parsePairingCode('0000-0000-0000-00000'), null);
  assert.equal(parsePairingCode('UUUU-0000-0000-0000'), null);
  assert.equal(parsePairingCode(undefined), null);
});

const fields = {
  pairingId: 'pair-0123456789abcdef01234567',
  machineId: 'skr-m4',
  machineLabel: 'Skora M4',
  signerKey: 'A'.repeat(43),
  expiresAt: '2026-11-22T10:10:00.000Z',
};

test('both MACs need the code and bind every field', () => {
  const code = parsePairingCode(newPairingCode());
  const key = pairingKey(code, fields.pairingId);
  const mac = machineMac(key, fields);
  assert.equal(mac.length, 32);
  assert.equal(
    macEqual(mac, machineMac(pairingKey(code, fields.pairingId), fields)),
    true
  );
  const wrongCode = pairingKey(
    parsePairingCode(newPairingCode()),
    fields.pairingId
  );
  assert.equal(macEqual(mac, machineMac(wrongCode, fields)), false);
  assert.equal(
    macEqual(mac, machineMac(pairingKey(code, 'pair-other'), fields)),
    false
  );
  for (const field of Object.keys(fields))
    assert.equal(
      macEqual(
        mac,
        machineMac(key, { ...fields, [field]: `${fields[field]}x` })
      ),
      false,
      field
    );
  const owner = { ...fields, ownerKey: 'B'.repeat(43) };
  const reply = ownerMac(key, owner);
  assert.equal(macEqual(reply, mac), false);
  assert.equal(
    macEqual(reply, ownerMac(key, { ...owner, ownerKey: 'C'.repeat(43) })),
    false
  );
  assert.equal(macEqual(reply, reply.subarray(0, 31)), false);
  assert.equal(macEqual(reply, 'not a buffer'), false);
});
