import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decryptSepayToken,
  encryptSepayToken,
  SepayReconnectRequiredError,
} from '../src/lib/sepay-crypto.ts';

test('rotating the SePay key requires reconnect and accepts new tokens', (t) => {
  const originalKey = process.env.SEPAY_OAUTH_TOKEN_ENCRYPTION_SECRET;
  t.after(() => {
    if (originalKey === undefined) {
      delete process.env.SEPAY_OAUTH_TOKEN_ENCRYPTION_SECRET;
    } else {
      process.env.SEPAY_OAUTH_TOKEN_ENCRYPTION_SECRET = originalKey;
    }
  });

  process.env.SEPAY_OAUTH_TOKEN_ENCRYPTION_SECRET = 'synthetic-old-key';
  const oldCiphertext = encryptSepayToken('synthetic-old-token');
  assert.equal(decryptSepayToken(oldCiphertext), 'synthetic-old-token');

  process.env.SEPAY_OAUTH_TOKEN_ENCRYPTION_SECRET = 'synthetic-new-key';
  assert.throws(() => decryptSepayToken(oldCiphertext), {
    name: SepayReconnectRequiredError.name,
    message: 'Reconnect SePay',
  });
  assert.throws(
    () => decryptSepayToken('malformed'),
    SepayReconnectRequiredError
  );
  assert.equal(
    decryptSepayToken(encryptSepayToken('synthetic-new-token')),
    'synthetic-new-token'
  );

  delete process.env.SEPAY_OAUTH_TOKEN_ENCRYPTION_SECRET;
  assert.throws(
    () => decryptSepayToken(oldCiphertext),
    /Missing SEPAY_OAUTH_TOKEN_ENCRYPTION_SECRET/
  );
});
