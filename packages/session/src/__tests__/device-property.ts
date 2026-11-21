/**
 * A seeded model of one device and its ports for property tests: a store
 * that injects `conflict`, `unknown` after a committed write on any attempt
 * and lost writes, a concurrent writer that commits between a mutation's
 * read and write, a user index with other devices to evict, issuers and an
 * upstream that fail at random, and acknowledgements that are lost at
 * random. Every write is tagged with the mutation that made it, so the
 * invariants can judge each committed transition. Test-only by path.
 */
import {
  acknowledgeEffects,
  commitMutation,
  type CommitOutcome,
  type DeviceContext,
  type DeviceMutation,
  type DeviceState,
  type DeviceStore,
  type EffectResult,
  type EmittedEffect,
  type EpochRaise,
  type Fence,
  freshFactors,
  GRANT_ACTS,
  type GrantAct,
  type JsonValue,
  type ReserveOutcome,
  type SessionFactor,
  signInWithReservation,
} from '../device';
import type { UserId } from '../principal';
import {
  createIssuer,
  createMemoryStore,
  createUpstream,
  createUserIndex,
  type MemoryStore,
  type Random,
  seededEntropy,
  seededRandom,
  testHashSecret,
  type WriteFault,
} from './device-fakes';
import { REGISTRY, T0, USER_A, USER_B } from './device-fixtures';

export const USER_C = '2d8b3e4c-5f60-4172-8c83-9d0e1f2a3b4c' as UserId;
export const USERS = [USER_A, USER_B, USER_C] as const;
/** More users than one device admits, so sign-ins reach its user ceiling. */
export const CROWD = Array.from(
  { length: 12 },
  (_, index) =>
    `c${index.toString(16).padStart(7, '0')}-0000-4000-8000-000000000000` as UserId
);
export const DEVICE_ID = 'device-under-test';
export const CAP = 2;

export type Tag = DeviceMutation | 'housekeeping';

/** A write the store applied, whatever acknowledgement the caller saw. */
export type AppliedWrite = {
  tag: Tag;
  base: DeviceState;
  next: DeviceState;
  raises: EpochRaise[];
};

export type CommitRecord = {
  mutation: DeviceMutation;
  outcome: CommitOutcome;
  /** Writes this mutation itself applied, not those of a concurrent writer. */
  applied: AppliedWrite[];
  reserved: ReserveOutcome | null;
};

export type Model = {
  random: Random;
  memory: MemoryStore;
  store: DeviceStore;
  ctx: DeviceContext;
  index: ReturnType<typeof createUserIndex>;
  issuers: {
    ai_token: ReturnType<typeof createIssuer>;
    handoff_code: ReturnType<typeof createIssuer>;
  };
  upstream: ReturnType<typeof createUpstream>;
  now: number;
  epochs: Record<string, number>;
  factors: Record<string, SessionFactor[]>;
  /** Every write the store applied, in order. */
  applied: AppliedWrite[];
  commits: CommitRecord[];
  /** Raw device and child secrets ever emitted, newest last. */
  secrets: Uint8Array[];
  fences: Fence[];
  codes: { sid: string; gen: number; epoch: number }[];
  /** Every grant issued, with the act and raw parameters it was confirmed for. */
  grants: { grantId: string; act: GrantAct; params: JsonValue }[];
  /** Epoch bumps whose fan-out is still to be delivered (possibly twice). */
  fanOuts: { userId: UserId; belowEpoch: number; bumpedAtMs: number }[];
  nextOp(): string;
  commit(mutation: DeviceMutation): Promise<CommitOutcome>;
  signIn(
    userId: UserId,
    patch?: Partial<DeviceMutation>
  ): Promise<CommitOutcome>;
  runEffects(outcome: CommitOutcome): Promise<void>;
  /** Runs housekeeping (acknowledgements, drain, cookies) with its writes tagged as such. */
  housekeeping<T>(run: () => Promise<T>): Promise<T>;
  /** True while a concurrent operation runs inside another mutation's write. */
  nested(): boolean;
  /** Runs one random operation concurrently with a pending write. */
  concurrent: (() => Promise<void>) | null;
  /** Runs once inside the next top-level write, before it lands. */
  race: (() => Promise<void>) | null;
};

const FAULTS: readonly (WriteFault | null)[] = [
  'conflict',
  'unknown_committed',
  'unknown_lost',
  'throw',
];

export function createModel(seed: number): Model {
  const random = seededRandom(seed);
  const memory = createMemoryStore();
  const tags: Tag[] = [];
  let ids = 0;
  let depth = 0;
  const model: Model = {
    random,
    memory,
    store: memory.store,
    ctx: {
      registry: REGISTRY,
      entropy: seededEntropy(random),
      hashSecret: testHashSecret,
    },
    index: createUserIndex(() => `res-${seed}-${++ids}`),
    issuers: {
      ai_token: createIssuer('ai_token', () => model.now),
      handoff_code: createIssuer('handoff_code', () => model.now),
    },
    upstream: createUpstream(),
    now: T0,
    epochs: {},
    factors: {},
    applied: [],
    commits: [],
    secrets: [],
    fences: [],
    codes: [],
    grants: [],
    fanOuts: [],
    nextOp: () => `op-${seed}-${++ids}`,
    commit: (mutation) =>
      tagged(mutation, () =>
        commitMutation({ store: model.store, ctx: model.ctx }, mutation)
      ),
    signIn: (userId, patch = {}) => signInFlow(model, userId, patch),
    runEffects: (outcome) => runEffects(model, outcome),
    nested: () => depth > 0,
    async housekeeping(run) {
      tags.push('housekeeping');
      try {
        return await run();
      } finally {
        tags.pop();
      }
    },
    concurrent: null,
    race: null,
  };
  memory.onWrite(() => (random.bool(0.3) ? random.pick(FAULTS) : null));
  const base = memory.store;
  model.store = {
    ...base,
    async write(expected, next, raises) {
      const race = depth === 0 ? model.race : null;
      if (race) model.race = null;
      const run =
        race ??
        (depth === 0 && model.concurrent && random.bool(0.1)
          ? model.concurrent
          : null);
      if (run) {
        depth += 1;
        try {
          await run();
        } finally {
          depth -= 1;
        }
      }
      const before = memory.committed.length;
      try {
        return await base.write(expected, next, raises);
      } finally {
        for (const write of memory.committed.slice(before)) {
          model.applied.push({
            tag: tags.at(-1) ?? 'housekeeping',
            base: write.base,
            next: write.next,
            raises: write.raises,
          });
        }
      }
    },
  };

  async function tagged(
    mutation: DeviceMutation,
    run: () => Promise<CommitOutcome>,
    reserved: () => ReserveOutcome | null = () => null
  ): Promise<CommitOutcome> {
    const from = model.applied.length;
    tags.push(mutation);
    let outcome: CommitOutcome;
    try {
      outcome = await run();
    } finally {
      tags.pop();
    }
    const applied = model.applied
      .slice(from)
      .filter((write) => write.tag === mutation);
    model.commits.push({ mutation, outcome, applied, reserved: reserved() });
    for (const effect of outcome.effects) {
      if (
        (effect.type === 'set_cookie' || effect.type === 'set_child_cookie') &&
        effect.secret
      ) {
        model.secrets.push(effect.secret);
      }
    }
    return outcome;
  }

  async function signInFlow(
    world: Model,
    userId: UserId,
    patch: Partial<DeviceMutation>
  ): Promise<CommitOutcome> {
    topUpOtherDevices(world, userId);
    let reserved: ReserveOutcome | null = null;
    const index = {
      ...world.index.port,
      async reserve(input: Parameters<typeof world.index.port.reserve>[0]) {
        reserved = await world.index.port.reserve(input);
        return reserved;
      },
    };
    const state = world.memory.state;
    // Usually what the enrolled factors call for; sometimes any method.
    const held = world.factors[userId] ?? [];
    const fitting = held.some((factor) => factor.method === 'totp')
      ? 1
      : held.some((factor) => factor.method === 'passkey')
        ? 2
        : 0;
    const amrChoice = world.random.bool(0.8) ? fitting : world.random.int(4);
    const request = {
      operationId: world.nextOp(),
      nowMs: world.now,
      fence: state.version === 0 ? null : currentOrStaleFence(world),
      outcome: signInOutcome(userId, amrChoice, world.random.bool(0.9)),
      capturedEpoch:
        (world.epochs[userId] ?? 0) - (world.random.bool(0.1) ? 1 : 0),
      epoch: epochFor(world, userId),
      factors: factorsFor(world, userId),
      deviceId: DEVICE_ID,
      cap: CAP,
      ...patch,
    } as Parameters<typeof signInWithReservation>[1];
    // The full mutation the flow builds, for tagging and later replays.
    const { deviceId: _deviceId, cap: _cap, ...body } = request;
    const mutation = { ...body, kind: 'sign_in' } as unknown as DeviceMutation;
    const outcome = await tagged(
      mutation,
      async () => {
        const out = await signInWithReservation(
          { store: world.store, ctx: world.ctx, index },
          request
        );
        const held = reserved as ReserveOutcome | null;
        if (held && (held.kind === 'reserved' || held.kind === 'swap')) {
          Object.assign(mutation, {
            reservation: { reservationId: held.reservation.reservationId },
            eviction:
              held.kind === 'swap'
                ? {
                    deviceId: held.evictDeviceId,
                    reservationId: held.evictReservationId,
                  }
                : null,
          });
        }
        return out;
      },
      () => reserved
    );
    return outcome;
  }

  return model;
}

/** Keeps the user's other devices at the cap, so a sign-in here must swap. */
function topUpOtherDevices(world: Model, userId: UserId) {
  const slots = world.index.slots.get(userId) ?? new Map();
  world.index.slots.set(userId, slots);
  let next = slots.size;
  while (slots.size < CAP) {
    next += 1;
    slots.set(`other-${userId.slice(0, 4)}-${next}-${world.now}`, {
      reservationId: `other-res-${userId.slice(0, 4)}-${next}-${world.now}`,
      confirmed: true,
      lastSeenAt: world.now - 1_000 * next,
      claims: {},
      victim: null,
    });
  }
}

export function currentOrStaleFence(world: Model): Fence {
  const state = world.memory.state;
  const current: Fence = {
    sessionId: state.activeSid,
    gen: state.gen,
    version: state.version,
  };
  world.fences.push(current);
  return world.random.bool(0.85) ? current : world.random.pick(world.fences);
}

export function epochFor(world: Model, userId: UserId) {
  const status = world.random.bool(0.9)
    ? ('fresh' as const)
    : world.random.pick(['stale', 'unavailable'] as const);
  const lag = world.random.bool(0.05) ? 6_000 : 0;
  return {
    userId: world.random.bool(0.04) ? world.random.pick(USERS) : userId,
    epoch: world.epochs[userId] ?? 0,
    readAtMs: world.now - lag,
    status,
  };
}

function factorsFor(world: Model, userId: UserId) {
  if (world.random.bool(0.04)) return 'unavailable' as const;
  return freshRead(userId, world.now, world.factors[userId] ?? []);
}

export function freshRead(
  userId: UserId,
  readAtMs: number,
  factors: SessionFactor[]
) {
  return freshFactors({ userId, readAtMs, factors });
}

function signInOutcome(userId: UserId, amrChoice: number, verified: boolean) {
  const amr = [['pwd'], ['pwd', 'totp'], ['passkey'], ['pwd', 'passkey']][
    amrChoice
  ] as ('pwd' | 'totp' | 'passkey')[];
  return {
    kind: 'authenticated' as const,
    provider: 'supabase' as const,
    providerSubject: `subject-${userId.slice(0, 4)}`,
    userId,
    aal: 'aal1' as const,
    amr,
    grant: {
      provider: 'supabase' as const,
      data: new Uint8Array([amrChoice, 7]),
    },
    passkeyUserVerified: verified,
    sessionKind: 'browser' as const,
  };
}

/**
 * Runs a commit's revocation effects through the ports and acknowledges
 * them, losing the acknowledgement at random; delivers a swap's slot revoke
 * to the evicted device, which acknowledges the index tombstone.
 */
async function runEffects(world: Model, outcome: CommitOutcome) {
  const results: EffectResult[] = [];
  for (const effect of outcome.effects as EmittedEffect[]) {
    if (effect.type === 'evict_device') {
      world.index.ackEviction(effect.userId, effect.deviceId);
    } else if (effect.type === 'revoke_upstream') {
      const ok =
        (await world.upstream.port.revokeUpstream(effect.grant)) === 'ok';
      results.push({ key: effect.outboxKey, effect: 'upstream', ok });
    } else if (effect.type === 'revoke_credentials') {
      const issuer = world.issuers[effect.issuer].issuer;
      const ok =
        (effect.before === null
          ? await issuer.revokeForSession(effect.sessionId)
          : await issuer.revokeForSessionBefore(
              effect.sessionId,
              effect.before
            )) === 'ok';
      results.push({
        key: effect.outboxKey,
        effect: 'credentials',
        issuer: effect.issuer,
        sessionId: effect.sessionId,
        before: effect.before,
        ok,
      });
    }
  }
  // A lost acknowledgement leaves the effects pending for the drain.
  if (results.length > 0 && world.random.bool(0.7)) {
    await world.housekeeping(() =>
      acknowledgeEffects(world.store, results, world.now)
    );
  }
}

export const STEP_UP_ACTS = Object.keys(GRANT_ACTS) as GrantAct[];
