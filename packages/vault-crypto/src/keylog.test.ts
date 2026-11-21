import { describe, expect, it } from 'vitest';
import { concatBytes, randomBytes } from './bytes';
import { sha256 } from './kdf';
import {
  assertEdkId,
  edkId,
  type EntryPayload,
  type EpochDescriptor,
  verifyKeyLog,
} from './keylog';
import { inclusionProof, leafHash, treeRoot, verifyInclusion } from './merkle';
import {
  descriptor,
  key,
  LogBuilder,
  makeGenesis,
  party,
  encKey,
} from './test-fixtures';

const alice = party('alice');
const bob = party('bob');
const carol = party('carol');
const dave = party('dave');

const member = (
  env: string,
  user: ReturnType<typeof party>,
  role: 'writer' | 'viewer' | 'reader' | 'admin',
  next_epochs: EpochDescriptor[] = []
): EntryPayload => ({
  kind: 'member_role',
  env,
  user_id: user.user_id,
  role,
  signing_key: user.signing_key,
  encryption_key: user.encryption_key,
  next_epochs,
});

const epoch = (env: string, n: number, fps?: number[]): EntryPayload => ({
  kind: 'epoch',
  descriptor: descriptor(env, n, fps),
});

function twoOwnerLog() {
  const log = new LogBuilder(makeGenesis([alice, bob], 2));
  log.append({ kind: 'admin_set', admins: [key(carol)], next_epochs: [] }, [
    alice,
    bob,
  ]);
  return log;
}

const replay = (log: LogBuilder) =>
  verifyKeyLog(log.genesis, log.entries, log.pinned);

describe('key log replay', () => {
  it('replays owner, admin, member, epoch and wrap entries with history', () => {
    const log = twoOwnerLog();
    log.append(member('prod', dave, 'writer'), [carol]);
    log.append(epoch('prod', 1), [carol]);
    log.append(
      {
        kind: 'wrap_addition',
        env: 'prod',
        epoch: 1,
        wraps: [
          {
            recipient_fp: new Uint8Array(32).fill(5),
            key_kind: 'esk',
            epoch: 1,
            digest: new Uint8Array(32).fill(6),
          },
        ],
      },
      [carol]
    );
    log.append(epoch('prod', 2), [carol]);
    const state = replay(log);
    expect(state.headSeq).toBe(5);
    expect(
      state.managersAt(state.headSeq).admins.map((a) => a.user_id)
    ).toEqual(['carol']);
    expect(state.managersAt(0).admins).toEqual([]);
    expect(state.roleAt('prod', 'dave', 5)?.role).toBe('writer');
    expect(state.roleAt('prod', 'dave', 1)).toBeNull();
    expect(state.epochAt('prod', 4)?.wrapIndex.size).toBe(2);
    expect(state.epochAt('prod')?.epoch).toBe(2);
    expect(() => state.roleAt('prod', 'dave', 6)).toThrow(/beyond/);
  });

  it('keeps role lookups injective across environment and user names', () => {
    const log = twoOwnerLog();
    log.append(
      { ...member('a\u0000b', dave, 'writer'), user_id: 'c' } as EntryPayload,
      [carol]
    );
    expect(replay(log).roleAt('a', 'b\u0000c', 2)).toBeNull();
  });
});

describe('owner quorum and thresholds', () => {
  it('rejects a genesis or owner update without a valid threshold', () => {
    const g = makeGenesis([alice], 1);
    const { threshold: _drop, ...noThreshold } = g.body;
    const pinned = new LogBuilder(g).pinned;
    expect(() => verifyKeyLog({ ...g, body: noThreshold }, [], pinned)).toThrow(
      /Malformed/
    );
    for (const threshold of [0, 2]) {
      const log = new LogBuilder(makeGenesis([alice], 1));
      log.append(
        { kind: 'owner_set', owners: [key(alice)], threshold, next_epochs: [] },
        [alice]
      );
      expect(() => replay(log)).toThrow();
    }
    const missing = new LogBuilder(makeGenesis([alice], 1));
    missing.append(
      {
        kind: 'owner_set',
        owners: [key(alice)],
        next_epochs: [],
      } as unknown as EntryPayload,
      [alice]
    );
    expect(() => replay(missing)).toThrow(/Malformed/);
  });

  it('rejects a genesis that is not the pinned vault or lacks quorum', () => {
    const log = twoOwnerLog();
    expect(() =>
      verifyKeyLog(log.genesis, log.entries, {
        ...log.pinned,
        vaultId: randomBytes(32),
      })
    ).toThrow();
    expect(() =>
      verifyKeyLog(log.genesis, log.entries, {
        ...log.pinned,
        deployment: 'prod',
      })
    ).toThrow();
    const weak = makeGenesis([alice, bob], 2, [alice]);
    expect(() => verifyKeyLog(weak, [], new LogBuilder(weak).pinned)).toThrow(
      /quorum/
    );
  });

  it('requires the owner quorum for admins and rejects duplicate, unsorted or foreign signatures', () => {
    const one = new LogBuilder(makeGenesis([alice, bob], 2));
    one.append({ kind: 'admin_set', admins: [key(carol)], next_epochs: [] }, [
      alice,
    ]);
    expect(() => replay(one)).toThrow(/quorum/);
    const log = twoOwnerLog();
    const entry = log.entries[0]!;
    const dup = {
      ...entry,
      signatures: [entry.signatures[0]!, entry.signatures[0]!],
    };
    expect(() => verifyKeyLog(log.genesis, [dup], log.pinned)).toThrow(
      /sorted/
    );
    const unsorted = { ...entry, signatures: [...entry.signatures].reverse() };
    expect(() => verifyKeyLog(log.genesis, [unsorted], log.pinned)).toThrow(
      /sorted/
    );
    const foreign = new LogBuilder(makeGenesis([alice, bob], 2));
    foreign.append(
      { kind: 'admin_set', admins: [key(carol)], next_epochs: [] },
      [alice, bob, dave]
    );
    expect(() => replay(foreign)).toThrow(/unauthorised/);
  });

  it('does not let an admin change the admin set', () => {
    const log = twoOwnerLog();
    log.append(
      { kind: 'admin_set', admins: [key(carol), key(dave)], next_epochs: [] },
      [carol]
    );
    expect(() => replay(log)).toThrow(/unauthorised/);
  });
});

describe('revocation', () => {
  it('removes every authority of a removed owner, including an overlapping admin key and member roles', () => {
    const log = new LogBuilder(makeGenesis([alice, bob], 1));
    log.append({ kind: 'admin_set', admins: [key(bob)], next_epochs: [] }, [
      alice,
    ]);
    log.append(member('prod', bob, 'writer'), [alice]);
    log.append(
      {
        kind: 'owner_set',
        owners: [key(alice)],
        threshold: 1,
        next_epochs: [],
      },
      [alice]
    );
    const state = replay(log);
    expect(state.managersAt(3).admins).toEqual([]);
    expect(state.roleAt('prod', 'bob', 3)?.role).toBe('none');
    log.append(member('prod', dave, 'writer'), [bob]);
    expect(() => replay(log)).toThrow(/unauthorised/);
  });

  it('requires exactly the next epochs when a removal or downgrade revokes decryption', () => {
    const base = () => {
      const log = twoOwnerLog();
      log.append(epoch('prod', 1), [carol]);
      log.append(member('prod', dave, 'reader'), [carol]);
      return log;
    };
    const missing = base();
    missing.append(member('prod', dave, 'viewer'), [carol]);
    expect(() => replay(missing)).toThrow(/next epoch/);
    const rotated = base();
    rotated.append(member('prod', dave, 'viewer', [descriptor('prod', 2)]), [
      carol,
    ]);
    expect(replay(rotated).epochAt('prod')?.epoch).toBe(2);
    const adminRemoved = base();
    adminRemoved.append({ kind: 'admin_set', admins: [], next_epochs: [] }, [
      alice,
      bob,
    ]);
    expect(() => replay(adminRemoved)).toThrow(/next epoch/);
    const unneeded = base();
    unneeded.append(
      member('prod', dave, 'editor' as 'reader', [descriptor('prod', 2)]),
      [carol]
    );
    expect(() => replay(unneeded)).toThrow(/next epoch/);
  });
});

describe('chain and epoch rules', () => {
  it('rejects broken chains, gaps, other vaults and time going backwards', () => {
    for (const overrides of [
      { prev_hash: randomBytes(32) },
      { seq: 5 },
      { vault_id: randomBytes(32) },
      { issued_at: 1 },
    ]) {
      const log = twoOwnerLog();
      log.append(member('prod', dave, 'writer'), [carol], overrides);
      expect(() => replay(log)).toThrow();
    }
  });

  it('requires epochs to advance by one with history, and wraps to target the current epoch once', () => {
    const skip = twoOwnerLog();
    skip.append(epoch('prod', 2), [carol]);
    expect(() => replay(skip)).toThrow(/advance/);
    const noHistory = twoOwnerLog();
    noHistory.append(epoch('prod', 1), [carol]);
    noHistory.append(
      {
        kind: 'epoch',
        descriptor: { ...descriptor('prod', 2), history: null },
      },
      [carol]
    );
    expect(() => replay(noHistory)).toThrow(/History/);
    const stale = twoOwnerLog();
    stale.append(epoch('prod', 1), [carol]);
    stale.append(epoch('prod', 2), [carol]);
    stale.append({ kind: 'wrap_addition', env: 'prod', epoch: 1, wraps: [] }, [
      carol,
    ]);
    expect(() => replay(stale)).toThrow(/current epoch/);
    const dup = twoOwnerLog();
    dup.append(epoch('prod', 1, [1, 1]), [carol]);
    expect(() => replay(dup)).toThrow(/Duplicate/);
  });

  it('rejects a tampered entry after signing', () => {
    const log = twoOwnerLog();
    const entry = log.append(member('prod', dave, 'viewer'), [carol]);
    const forged = {
      ...entry,
      body: { ...entry.body, payload: member('prod', dave, 'admin') },
    };
    expect(() =>
      verifyKeyLog(log.genesis, [log.entries[0]!, forged], log.pinned)
    ).toThrow();
  });
});

describe('RFC 9162 Merkle proofs', () => {
  it('proves every leaf for trees of 1 to 17 leaves and rejects wrong leaves and paths', () => {
    for (let n = 1; n <= 17; n++) {
      const leaves = Array.from({ length: n }, (_, i) =>
        leafHash(new Uint8Array([i]))
      );
      const root = treeRoot(leaves);
      leaves.forEach((leaf, i) => {
        const proof = inclusionProof(leaves, i);
        expect(verifyInclusion(i, n, leaf, proof, root)).toBe(true);
        // Tree size is authenticated by the signed attestation, not the path.
        expect(
          verifyInclusion(i, n, leafHash(new Uint8Array([99])), proof, root)
        ).toBe(false);
        expect(verifyInclusion(n, n, leaf, proof, root)).toBe(false);
        expect(verifyInclusion(i, n, leaf, [...proof, root], root)).toBe(false);
        if (proof.length > 0)
          expect(verifyInclusion(i, n, leaf, proof.slice(1), root)).toBe(false);
        if (n > 1)
          expect(verifyInclusion((i + 1) % n, n, leaf, proof, root)).toBe(
            false
          );
      });
    }
  });

  it('matches an independently computed uneven tree', () => {
    const H = (...parts: Uint8Array[]) => sha256(concatBytes(...parts));
    const [l0, l1, l2] = [0, 1, 2].map((i) =>
      H(new Uint8Array([0]), new Uint8Array([i]))
    ) as [Uint8Array, Uint8Array, Uint8Array];
    expect(treeRoot([l0, l1, l2])).toEqual(
      H(new Uint8Array([1]), H(new Uint8Array([1]), l0, l1), l2)
    );
    expect(inclusionProof([l0, l1, l2], 2)).toEqual([
      H(new Uint8Array([1]), l0, l1),
    ]);
  });

  it('hashes the empty tree as SHA-256 of nothing', () => {
    expect(Buffer.from(treeRoot([])).toString('hex')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });
});

describe('fresh keys, identity binding and wrap history', () => {
  it('rejects an epoch that reuses earlier key material', () => {
    const log = twoOwnerLog();
    log.append(epoch('prod', 1), [carol]);
    log.append(
      {
        kind: 'epoch',
        descriptor: {
          ...descriptor('prod', 2),
          intake_key: descriptor('prod', 1).intake_key,
        },
      },
      [carol]
    );
    expect(() => replay(log)).toThrow(/fresh/);
    const esk = twoOwnerLog();
    esk.append(epoch('prod', 1), [carol]);
    esk.append(
      {
        kind: 'epoch',
        descriptor: {
          ...descriptor('prod', 2),
          esk_key: descriptor('prod', 1).esk_key,
        },
      },
      [carol]
    );
    expect(() => replay(esk)).toThrow(/fresh/);
  });

  it('requires rotation when a decrypting member key is replaced', () => {
    const base = () => {
      const log = twoOwnerLog();
      log.append(epoch('prod', 1), [carol]);
      log.append(member('prod', dave, 'reader'), [carol]);
      return log;
    };
    const newEnc = base();
    newEnc.append(
      {
        ...member('prod', dave, 'reader'),
        encryption_key: encKey(),
      } as EntryPayload,
      [carol]
    );
    expect(() => replay(newEnc)).toThrow(/next epoch/);
    const ok = base();
    ok.append(
      {
        ...member('prod', dave, 'reader', [descriptor('prod', 2)]),
        encryption_key: encKey(),
      } as EntryPayload,
      [carol]
    );
    expect(replay(ok).epochAt('prod')?.epoch).toBe(2);
  });

  it('binds one key per user across roles and revokes grants under a replaced key', () => {
    const shadow = party('carol');
    const log = twoOwnerLog();
    log.append(member('prod', shadow, 'writer'), [carol]);
    expect(() => replay(log)).toThrow(/another key/);
    const memberOnly = twoOwnerLog();
    memberOnly.append(member('prod', dave, 'writer'), [carol]);
    memberOnly.append(member('dev', party('dave'), 'writer'), [carol]);
    expect(replay(memberOnly).roleAt('prod', 'dave', 3)?.role).toBe('none');
    const reused = twoOwnerLog();
    reused.append(
      {
        ...member('prod', dave, 'writer'),
        signing_key: carol.signing_key,
      } as EntryPayload,
      [carol]
    );
    expect(() => replay(reused)).toThrow(/two users/);
  });

  it('shows wrap additions only from their own sequence', () => {
    const log = twoOwnerLog();
    log.append(epoch('prod', 1), [carol]);
    log.append(
      {
        kind: 'wrap_addition',
        env: 'prod',
        epoch: 1,
        wraps: [
          {
            recipient_fp: new Uint8Array(32).fill(5),
            key_kind: 'esk',
            epoch: 1,
            digest: new Uint8Array(32).fill(6),
          },
        ],
      },
      [carol]
    );
    const state = replay(log);
    expect(state.epochAt('prod', 2)?.wrapIndex.size).toBe(1);
    expect(state.epochAt('prod', 3)?.wrapIndex.size).toBe(2);
  });

  it('identifies an EDK by its signed identifier', () => {
    const edk = randomBytes(32);
    expect(edkId(edk)).toEqual(edkId(edk.slice()));
    expect(edkId(edk)).not.toEqual(edkId(randomBytes(32)));
  });
});

describe('wire shape hardening', () => {
  it('rejects symbol, hidden and accessor properties and sparse lists', () => {
    const log = twoOwnerLog();
    const entry = log.entries[0]!;
    const withSymbol = { ...entry, [Symbol('x')]: 1 };
    expect(() => verifyKeyLog(log.genesis, [withSymbol], log.pinned)).toThrow(
      /Malformed/
    );
    const hidden = { ...entry };
    Object.defineProperty(hidden, 'extra', { value: 1, enumerable: false });
    expect(() => verifyKeyLog(log.genesis, [hidden], log.pinned)).toThrow(
      /Malformed/
    );
    const accessor = {
      body: entry.body,
      get signatures() {
        return entry.signatures;
      },
    };
    expect(() => verifyKeyLog(log.genesis, [accessor], log.pinned)).toThrow(
      /Malformed/
    );
    const sparse = new Array(1);
    expect(() => verifyKeyLog(log.genesis, sparse, log.pinned)).toThrow();
    const sparseSigs = { ...entry, signatures: new Array(1) };
    expect(() => verifyKeyLog(log.genesis, [sparseSigs], log.pinned)).toThrow(
      /Malformed/
    );
  });
});

describe('manager identity and promotion', () => {
  it('rotates every environment where a member decrypted when promotion replaces their key', () => {
    const base = () => {
      const log = twoOwnerLog();
      log.append(epoch('prod', 1), [carol]);
      log.append(epoch('dev', 1), [carol]);
      log.append(member('prod', dave, 'reader'), [carol]);
      log.append(member('dev', dave, 'reader'), [carol]);
      return log;
    };
    const newDave = party('dave');
    const missing = base();
    missing.append(
      {
        kind: 'admin_set',
        admins: [key(carol), key(newDave)],
        next_epochs: [],
      },
      [alice, bob]
    );
    expect(() => replay(missing)).toThrow(/next epoch/);
    const rotated = base();
    rotated.append(
      {
        kind: 'admin_set',
        admins: [key(carol), key(newDave)],
        next_epochs: [descriptor('prod', 2), descriptor('dev', 2)],
      },
      [alice, bob]
    );
    const state = replay(rotated);
    expect(state.epochAt('prod')?.epoch).toBe(2);
    expect(state.roleAt('dev', 'dave', 6)?.role).toBe('none');
  });

  it('binds genesis owners and rejects one user holding two manager keys', () => {
    const otherAlice = party('alice');
    const log = new LogBuilder(makeGenesis([alice, bob], 1));
    log.append(
      { kind: 'admin_set', admins: [key(otherAlice)], next_epochs: [] },
      [alice]
    );
    expect(() => replay(log)).toThrow(/another key/);
    const same = new LogBuilder(makeGenesis([alice, bob], 1));
    same.append({ kind: 'admin_set', admins: [key(alice)], next_epochs: [] }, [
      alice,
    ]);
    expect(() => replay(same)).not.toThrow();
    const member = twoOwnerLog();
    member.append(
      {
        kind: 'member_role',
        env: 'prod',
        user_id: 'dave',
        role: 'writer',
        signing_key: alice.signing_key,
        encryption_key: encKey(),
        next_epochs: [],
      },
      [carol]
    );
    expect(() => replay(member)).toThrow(/two users/);
  });
});

describe('canonical X25519 keys and EDK identifiers', () => {
  const p = (1n << 255n) - 19n;
  const le = (n: bigint) =>
    Uint8Array.from({ length: 32 }, (_, i) =>
      Number((n >> BigInt(8 * i)) & 0xffn)
    );

  it('rejects non-canonical, small-order and twist epoch keys', () => {
    const good = descriptor('prod', 1);
    const highBit = good.intake_key.slice();
    highBit[31] = (highBit[31] ?? 0) | 0x80;
    for (const bad of [
      highBit,
      le(p),
      le(p + 1n),
      le(0n),
      le(1n),
      le(p - 1n),
      new Uint8Array(32).fill(0xff).map((b, i) => (i === 31 ? 0x7f : b)),
    ]) {
      const log = twoOwnerLog();
      log.append({ kind: 'epoch', descriptor: { ...good, intake_key: bad } }, [
        carol,
      ]);
      expect(() => replay(log)).toThrow();
    }
    let twist: Uint8Array | null = null;
    for (let u = 2n; !twist; u++) {
      const log = twoOwnerLog();
      log.append({ kind: 'epoch', descriptor: { ...good, esk_key: le(u) } }, [
        carol,
      ]);
      try {
        replay(log);
      } catch (e) {
        if (String(e).includes('not on Curve25519')) twist = le(u);
      }
    }
    expect(twist).not.toBeNull();
  });

  it('checks an unwrapped EDK against its descriptor', () => {
    const edk = randomBytes(32);
    expect(() => assertEdkId({ edk_id: edkId(edk) }, edk)).not.toThrow();
    expect(() => assertEdkId({ edk_id: edkId(edk) }, randomBytes(32))).toThrow(
      /does not match/
    );
  });

  it('rejects accessor list items and null-prototype objects', () => {
    const log = twoOwnerLog();
    const entry = log.entries[0]!;
    const sigs = [...entry.signatures];
    Object.defineProperty(sigs, 0, {
      get: () => entry.signatures[0],
      enumerable: true,
    });
    expect(() =>
      verifyKeyLog(log.genesis, [{ ...entry, signatures: sigs }], log.pinned)
    ).toThrow(/Malformed/);
    const nullProto = Object.assign(Object.create(null), entry);
    expect(() => verifyKeyLog(log.genesis, [nullProto], log.pinned)).toThrow(
      /Malformed/
    );
  });
});
