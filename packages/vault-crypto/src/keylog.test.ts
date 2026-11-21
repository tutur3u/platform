import { describe, expect, it } from 'vitest';
import { randomBytes } from './bytes';
import { type EntryPayload, verifyKeyLog } from './keylog';
import { inclusionProof, leafHash, treeRoot, verifyInclusion } from './merkle';
import { key, LogBuilder, makeGenesis, party } from './test-fixtures';

const alice = party('alice');
const bob = party('bob');
const carol = party('carol');
const dave = party('dave');

const member = (
  env: string,
  user: ReturnType<typeof party>,
  role: 'writer' | 'viewer' | 'admin'
): EntryPayload => ({
  kind: 'member_role',
  env,
  user_id: user.user_id,
  role,
  signing_key: user.signing_key,
  encryption_key: new Uint8Array(32).fill(1),
});

const epoch = (env: string, n: number, fps: number[] = [1]): EntryPayload => ({
  kind: 'epoch',
  env,
  epoch: n,
  intake_key: new Uint8Array(32).fill(2),
  esk_key: new Uint8Array(32).fill(3),
  pin_allowed: false,
  wraps: fps.map((f) => ({
    recipient_fp: new Uint8Array(32).fill(f),
    key_kind: 'edk',
    epoch: n,
    digest: new Uint8Array(32).fill(f + 10),
  })),
});

function twoOwnerLog() {
  const log = new LogBuilder(makeGenesis([alice, bob], 2));
  log.append({ kind: 'admin_set', admins: [key(carol)] }, [alice, bob]);
  return log;
}

describe('key log', () => {
  it('replays owner, admin, member, epoch and wrap entries', () => {
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
            key_kind: 'edk',
            epoch: 1,
            digest: new Uint8Array(32).fill(6),
          },
        ],
      },
      [carol]
    );
    const state = verifyKeyLog(log.genesis, log.entries, log.pinned);
    expect(state.headSeq).toBe(4);
    expect(state.admins.map((a) => a.user_id)).toEqual(['carol']);
    expect(state.roleAt('prod', 'dave', 4)?.role).toBe('writer');
    expect(state.roleAt('prod', 'dave', 1)).toBeNull();
    expect(state.epochOf('prod')?.wraps.size).toBe(2);
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
    const weakLog = new LogBuilder(weak);
    expect(() => verifyKeyLog(weak, [], weakLog.pinned)).toThrow();
  });

  it('requires the owner quorum to appoint admins, counting each key once', () => {
    const log = new LogBuilder(makeGenesis([alice, bob], 2));
    log.append({ kind: 'admin_set', admins: [key(carol)] }, [alice, alice]);
    expect(() => verifyKeyLog(log.genesis, log.entries, log.pinned)).toThrow(
      /quorum/
    );
  });

  it('lets an admin manage members but not owners or admins', () => {
    const log = twoOwnerLog();
    log.append({ kind: 'admin_set', admins: [key(carol), key(dave)] }, [carol]);
    expect(() => verifyKeyLog(log.genesis, log.entries, log.pinned)).toThrow(
      /quorum/
    );
  });

  it('revokes a removed owner from that entry on', () => {
    const log = new LogBuilder(makeGenesis([alice, bob], 1));
    log.append({ kind: 'owner_set', owners: [key(alice)], threshold: 1 }, [
      alice,
    ]);
    log.append({ kind: 'admin_set', admins: [key(dave)] }, [bob]);
    expect(() => verifyKeyLog(log.genesis, log.entries, log.pinned)).toThrow(
      /quorum/
    );
  });

  it('rejects signatures from keys outside the authorised sets', () => {
    const log = twoOwnerLog();
    log.append(member('prod', dave, 'admin'), [dave]);
    expect(() => verifyKeyLog(log.genesis, log.entries, log.pinned)).toThrow(
      /admin signature/
    );
  });

  it('rejects broken chains, gaps, other vaults and time going backwards', () => {
    for (const overrides of [
      { prev_hash: randomBytes(32) },
      { seq: 5 },
      { vault_id: randomBytes(32) },
      { issued_at: 1 },
    ]) {
      const log = twoOwnerLog();
      log.append(member('prod', dave, 'writer'), [carol], overrides);
      expect(() =>
        verifyKeyLog(log.genesis, log.entries, log.pinned)
      ).toThrow();
    }
  });

  it('requires epochs to advance by one and wraps to target the current epoch once', () => {
    const skip = twoOwnerLog();
    skip.append(epoch('prod', 2), [carol]);
    expect(() => verifyKeyLog(skip.genesis, skip.entries, skip.pinned)).toThrow(
      /advance/
    );

    const stale = twoOwnerLog();
    stale.append(epoch('prod', 1), [carol]);
    stale.append(epoch('prod', 2), [carol]);
    stale.append({ kind: 'wrap_addition', env: 'prod', epoch: 1, wraps: [] }, [
      carol,
    ]);
    expect(() =>
      verifyKeyLog(stale.genesis, stale.entries, stale.pinned)
    ).toThrow(/current epoch/);

    const dup = twoOwnerLog();
    dup.append(epoch('prod', 1, [1, 1]), [carol]);
    expect(() => verifyKeyLog(dup.genesis, dup.entries, dup.pinned)).toThrow(
      /Duplicate/
    );
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
  it('proves every leaf for trees of 1 to 17 leaves', () => {
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
        if (n > 1) {
          expect(verifyInclusion((i + 1) % n, n, leaf, proof, root)).toBe(
            false
          );
        }
      });
    }
  });

  it('hashes the empty tree as SHA-256 of nothing', () => {
    expect(Buffer.from(treeRoot([])).toString('hex')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });
});
