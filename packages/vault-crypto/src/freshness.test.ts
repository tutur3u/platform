import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { describe, expect, it } from 'vitest';
import { equalBytes, randomBytes } from './bytes';
import { sha256 } from './kdf';
import { type EpochDescriptor, verifyKeyLog } from './keylog';
import { signRecord, verifyAppend } from './records';
import {
  DEPLOYMENT,
  descriptor,
  key,
  LogBuilder,
  makeGenesis,
  party,
} from './test-fixtures';
import { dhClass } from './x25519';

const P = (1n << 255n) - 19n;
const le = (n: bigint) =>
  Uint8Array.from({ length: 32 }, (_, i) =>
    Number((n >> BigInt(8 * i)) & 0xffn)
  );
const fromLe = (b: Uint8Array) =>
  b.reduceRight((acc, byte) => (acc << 8n) | BigInt(byte), 0n);
function pow(base: bigint, exp: bigint): bigint {
  let r = 1n;
  let b = base % P;
  for (let e = exp; e > 0n; e >>= 1n) {
    if (e & 1n) r = (r * b) % P;
    b = (b * b) % P;
  }
  return r;
}
const inverse = (u: bigint) => pow(u, P - 2n);
/** The u-coordinate of P + T for the order-2 point T = (0, 0) is 1/u. */
const withOrderTwo = (k: Uint8Array) => le(inverse(fromLe(k)));

describe('Diffie-Hellman classes', () => {
  it('matches [8]G computed on the birationally equivalent Edwards curve', () => {
    const { y } = ed25519.Point.BASE.multiply(8n).toAffine();
    const u = ((1n + y) * inverse((1n - y + P) % P)) % P;
    expect(dhClass(le(9n))).toEqual(le(u));
  });

  it('gives P and P + T one class, matching their equal shared secrets', () => {
    const k = x25519.getPublicKey(randomBytes(32));
    const twin = withOrderTwo(k);
    expect(equalBytes(twin, k)).toBe(false);
    const scalar = randomBytes(32);
    expect(x25519.getSharedSecret(scalar, twin)).toEqual(
      x25519.getSharedSecret(scalar, k)
    );
    expect(dhClass(twin)).toEqual(dhClass(k));
    expect(dhClass(x25519.getPublicKey(randomBytes(32)))).not.toEqual(
      dhClass(k)
    );
  });
});

describe('epoch key freshness', () => {
  const owner = party('owner');
  const first = descriptor('prod', 1);

  it('rejects an epoch key that is an earlier key plus a small-order point', () => {
    for (const field of ['intake_key', 'esk_key'] as const) {
      const l = new LogBuilder(makeGenesis([owner], 1));
      l.append({ kind: 'epoch', descriptor: first }, [owner]);
      const reused: EpochDescriptor = {
        ...descriptor('prod', 2),
        [field]: withOrderTwo(first[field]),
      };
      l.append({ kind: 'epoch', descriptor: reused }, [owner]);
      expect(() => verifyKeyLog(l.genesis, l.entries, l.pinned)).toThrow(
        /fresh/
      );
    }
  });

  it('rejects a non-canonical member encryption key', () => {
    const dave = party('dave');
    const highBit = dave.encryption_key.slice();
    highBit[31] = (highBit[31] ?? 0) | 0x80;
    for (const bad of [highBit, le(0n), le(P)]) {
      const l = new LogBuilder(makeGenesis([owner], 1));
      l.append({ kind: 'epoch', descriptor: first }, [owner]);
      l.append(
        {
          kind: 'member_role',
          env: 'prod',
          user_id: 'dave',
          role: 'writer',
          signing_key: dave.signing_key,
          encryption_key: bad,
          next_epochs: [],
        },
        [owner]
      );
      expect(() => verifyKeyLog(l.genesis, l.entries, l.pinned)).toThrow(
        /member encryption key/
      );
    }
  });
});

describe('manager rebinding as an authority change point', () => {
  it('rejects a member write signed under a key that an admin appointment replaced', () => {
    const owner = party('owner');
    const dave = party('dave');
    const daveAsAdmin = { ...party('dave-admin'), user_id: 'dave' };
    const build = (rebind: boolean) => {
      const l = new LogBuilder(makeGenesis([owner], 1));
      l.append({ kind: 'epoch', descriptor: descriptor('prod', 1) }, [owner]);
      l.append(
        {
          kind: 'member_role',
          env: 'prod',
          user_id: 'dave',
          role: 'writer',
          signing_key: dave.signing_key,
          encryption_key: dave.encryption_key,
          next_epochs: [],
        },
        [owner]
      );
      if (rebind) {
        l.append(
          {
            kind: 'admin_set',
            admins: [key(daveAsAdmin)],
            // A writer cannot decrypt, so replacing its key needs no rotation
            // and the record's epoch stays current: only the change point fails.
            next_epochs: [],
          },
          [owner]
        );
      }
      return l;
    };
    const record = (l: LogBuilder) =>
      signRecord(dave.pair.secretKey, {
        deployment: DEPLOYMENT,
        vault_id: l.vaultId,
        env: 'prod',
        variable_id: 'var-1',
        name: 'API_TOKEN',
        type: 'secret',
        sensitive: false,
        version: 1,
        epoch: 1,
        cipher: 'hpke-intake',
        enc_id: randomBytes(16),
        ciphertext_hash: sha256(randomBytes(8)),
        prev_record_hash: null,
        auth_seq: 2,
        writer_id: 'dave',
        written_at: 1000,
        source: null,
      });
    const control = build(false);
    expect(() =>
      verifyAppend(
        record(control),
        verifyKeyLog(control.genesis, control.entries, control.pinned),
        null
      )
    ).not.toThrow();
    const rebound = build(true);
    expect(() =>
      verifyAppend(
        record(rebound),
        verifyKeyLog(rebound.genesis, rebound.entries, rebound.pinned),
        null
      )
    ).toThrow(/revoked/);
  });
});
