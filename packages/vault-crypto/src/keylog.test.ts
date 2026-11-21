import { describe, expect, it } from 'vitest';
import { concatBytes, randomBytes } from './bytes';
import { sha256 } from './kdf';
import {
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
  encryption_key: new Uint8Array(32).fill(1),
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
