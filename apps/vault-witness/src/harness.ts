/** Test-only engine harness over in-memory SQLite. */
import type { SignedEntry, SignedRecord } from '@tuturuuu/vault-crypto';
import {
  DEPLOYMENT,
  descriptor,
  LogBuilder,
  makeGenesis,
  party,
  signer,
  sqlite,
} from './test-support';
import {
  createVaultEngine,
  type Signer,
  type VaultEngine,
} from './vault-engine';

export const T0 = 1_800_000_000_000;

export async function harness() {
  const db = sqlite();
  const owner = party('owner');
  const log = new LogBuilder(makeGenesis([owner]));
  const keys = new Map<number, Uint8Array>();
  let current: Signer = signer(1);
  keys.set(1, (current as ReturnType<typeof signer>).publicKey);
  let engine = createVaultEngine(db.sql, current);
  const clock = { now: T0 };
  function run<T>(fn: (e: VaultEngine) => T): T {
    return db.tx(() => fn(engine));
  }
  function base() {
    return {
      witness_generation: current.generation,
      seq: log.entries.length,
      key_log_head: log.head,
    };
  }
  const h = {
    db,
    owner,
    log,
    keys,
    get now() {
      return clock.now;
    },
    set now(value: number) {
      clock.now = value;
    },
    get engine() {
      return engine;
    },
    run,
    /** A cold start: a new engine over the same storage, optionally rotated. */
    restart(generation?: number) {
      if (generation !== undefined) {
        const next = signer(generation);
        keys.set(generation, next.publicKey);
        current = next;
      }
      engine = createVaultEngine(db.sql, current);
    },
    signerGeneration: () => current.generation,
    base,
    challenge(): Uint8Array {
      const c = run((e) => e.challenge(clock.now));
      if (!c.ok) throw new Error(`challenge failed: ${c.error}`);
      return c.challenge;
    },
    submit(
      entry: SignedEntry | null,
      records: SignedRecord[] = [],
      head = base()
    ) {
      const c = run((e) => e.challenge(clock.now));
      if (!c.ok) return c;
      const challenge = c.challenge;
      const result = run((e) =>
        e.append({ challenge, base: head, entry, records }, clock.now)
      );
      if (result.ok && entry) log.commit(entry);
      return result;
    },
    scope: { deployment: DEPLOYMENT, vault_id: log.vaultId },
  };
  const init = h.run((e) =>
    e.init({ vault_id: log.vaultId, genesis: log.genesis }, DEPLOYMENT, h.now)
  );
  if (!init.ok) throw new Error('init failed');
  const epoch1 = log.next(
    { kind: 'epoch', descriptor: await descriptor('prod', 1) },
    [owner]
  );
  const first = h.submit(epoch1);
  if (!first.ok) throw new Error(`epoch failed: ${first.message}`);
  return h;
}

export type Harness = Awaited<ReturnType<typeof harness>>;
