/** Device state machine scenarios: a registry, a world and mutation builders. Test-only by path. */
import {
  commitMutation,
  type CommitOutcome,
  createRouteRegistry,
  type DeviceContext,
  type DeviceMutation,
  type DeviceState,
  type EmittedEffect,
  type EpochRead,
  type Fence,
  freshFactors,
  GRANT_ACTS,
  type GrantAct,
  type MutationOf,
  type RouteDeclaration,
  type SessionFactor,
  type SignInOutcome,
} from '../device';
import type { JsonValue } from '../encoding';
import type { UserId } from '../principal';
import {
  createMemoryStore,
  type MemoryStore,
  seededEntropy,
  seededRandom,
  testHashSecret,
} from './device-fakes';

export const USER_A = '0b6f1c2a-3d4e-4f50-8a61-7b8c9d0e1f2a' as UserId;
export const USER_B = '1c7a2d3b-4e5f-4061-9b72-8c9d0e1f2a3b' as UserId;
export const T0 = 1_800_000_000_000;

export const stepUpRouteFor = (act: GrantAct) => `stepup.${act}`;

const declarations: Record<string, RouteDeclaration> = {
  'app.read': { class: 'read', accountScoped: true },
  'app.public_read': { class: 'read', accountScoped: false },
  'app.write': { class: 'write', accountScoped: true },
  'auth.ai_token.mint': { class: 'credential', accountScoped: true },
  'auth.handoff.mint': { class: 'credential', accountScoped: true },
};
for (const act of Object.keys(GRANT_ACTS) as GrantAct[]) {
  declarations[stepUpRouteFor(act)] = {
    class: 'security',
    accountScoped: true,
    stepUp: {
      act,
      tenantParams: Object.keys(GRANT_ACTS[act].params),
    },
  };
}
export const REGISTRY = createRouteRegistry(declarations);

export const ACT_PARAMS: Record<GrantAct, JsonValue> = {
  'account.mfa.enroll': { factorType: 'totp', factorId: 'totp-new' },
  'account.mfa.remove': { factorIds: ['totp-1'] },
  'account.mfa.reset': { factorIds: ['totp-1'] },
  'account.passkey.enroll': { credentialId: 'pk-new' },
  'account.passkey.remove': { credentialIds: ['pk-1'] },
  'account.password': { passwordChangeId: 'pwchange-1' },
  'account.email': { newEmailHash: 'aGFzaA' },
  'account.delete': { userId: USER_A },
  'sessions.revoke_all': { userId: USER_A },
  'api_keys.create': { workspaceId: 'ws-1', keyName: 'ci', role: 'member' },
  'api_keys.rotate': { workspaceId: 'ws-1', keyId: 'key-1' },
  'api_keys.revoke': { workspaceId: 'ws-1', keyId: 'key-1' },
  'cli.approve': { userCode: 'ABCD-EFGH', clientId: 'cli' },
  'qr.approve': { challengeId: 'qr-1' },
  'oauth.consent': {
    clientId: 'client-1',
    scopes: ['openid'],
    workspaceIds: ['ws-1'],
  },
  'vault.pin-eval': {
    challenge: 'CQkJCQkJCQkJCQkJCQkJCQ',
    wrapVersion: 3,
    clientKey: 'AQIDBA',
    blindedElementHash: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc',
  },
};

export const TOTP: SessionFactor = {
  factorId: 'totp-1',
  method: 'totp',
  role: 'second_factor',
};
export const SIGN_IN_PASSKEY: SessionFactor = {
  factorId: 'pk-1',
  method: 'passkey',
  role: 'sign_in',
};
export const MFA_PASSKEY: SessionFactor = {
  factorId: 'pk-mfa',
  method: 'passkey',
  role: 'second_factor',
};

export function epochRead(
  userId: UserId,
  epoch: number,
  readAtMs: number,
  status: EpochRead['status'] = 'fresh'
): EpochRead {
  return { userId, epoch, readAtMs, status };
}

export function factorRead(
  userId: UserId,
  readAtMs: number,
  factors: SessionFactor[] = []
) {
  return freshFactors({ userId, readAtMs, factors });
}

export function outcomeFor(
  userId: UserId,
  patch: Partial<SignInOutcome> = {}
): SignInOutcome {
  return {
    kind: 'authenticated',
    provider: 'supabase',
    providerSubject: `subject-${userId.slice(0, 4)}`,
    userId,
    aal: 'aal1',
    amr: ['pwd'],
    grant: { provider: 'supabase', data: new Uint8Array([1, 2, 3]) },
    passkeyUserVerified: false,
    sessionKind: 'browser',
    ...patch,
  };
}

export function fenceOf(state: DeviceState): Fence {
  return { sessionId: state.activeSid, gen: state.gen, version: state.version };
}

export type World = {
  memory: MemoryStore;
  ctx: DeviceContext;
  now: number;
  epochs: Record<string, number>;
  factors: Record<string, SessionFactor[]>;
  nextOp(): string;
  advance(ms: number): void;
  commit(mutation: DeviceMutation): Promise<CommitOutcome>;
  state(): DeviceState;
  epoch(userId: UserId, status?: EpochRead['status']): EpochRead;
  signIn(
    userId: UserId,
    patch?: Partial<MutationOf<'sign_in'>> & { outcome?: SignInOutcome }
  ): Promise<CommitOutcome>;
  fenced<
    K extends
      | 'switch'
      | 'rotate'
      | 'grant_step_up'
      | 'consume_step_up'
      | 'record_factors',
  >(
    body: Omit<MutationOf<K>, 'operationId' | 'nowMs' | 'fence'> & {
      fence?: Fence;
    }
  ): Promise<CommitOutcome>;
  grant(act: GrantAct, params?: JsonValue): Promise<string>;
  secretOf(outcome: CommitOutcome): Uint8Array;
};

export function createWorld(seed = 1): World {
  const random = seededRandom(seed);
  const memory = createMemoryStore();
  const ctx: DeviceContext = {
    registry: REGISTRY,
    entropy: seededEntropy(random),
    hashSecret: testHashSecret,
  };
  let counter = 0;
  const world: World = {
    memory,
    ctx,
    now: T0,
    epochs: {},
    factors: {},
    nextOp: () => `op-${++counter}`,
    advance(ms) {
      world.now += ms;
    },
    commit: (mutation) =>
      commitMutation({ store: memory.store, ctx }, mutation),
    state: () => memory.state,
    epoch: (userId, status = 'fresh') =>
      epochRead(userId, world.epochs[userId] ?? 0, world.now, status),
    signIn(userId, patch = {}) {
      return world.commit({
        kind: 'sign_in',
        operationId: world.nextOp(),
        nowMs: world.now,
        fence: memory.state.version === 0 ? null : fenceOf(memory.state),
        outcome: outcomeFor(userId),
        reservation: { reservationId: `slot-${userId.slice(0, 4)}-${counter}` },
        eviction: null,
        capturedEpoch: world.epochs[userId] ?? 0,
        epoch: world.epoch(userId),
        factors: factorRead(userId, world.now, world.factors[userId] ?? []),
        ...patch,
      } as DeviceMutation);
    },
    fenced(body) {
      return world.commit({
        operationId: world.nextOp(),
        nowMs: world.now,
        fence: fenceOf(memory.state),
        ...body,
      } as DeviceMutation);
    },
    async grant(act, params = ACT_PARAMS[act]) {
      const active = memory.state.activeSid;
      const userId = active
        ? (memory.state.sessions[active]?.userId as UserId)
        : USER_A;
      const out = await world.fenced<'grant_step_up'>({
        kind: 'grant_step_up',
        route: stepUpRouteFor(act),
        params,
        epoch: world.epoch(userId),
      });
      if (!out.result.ok || !out.result.grantId)
        throw new Error('grant failed');
      return out.result.grantId;
    },
    secretOf(outcome) {
      const cookie = outcome.effects.find(
        (effect): effect is Extract<EmittedEffect, { type: 'set_cookie' }> =>
          effect.type === 'set_cookie'
      );
      if (!cookie?.secret) throw new Error('no cookie secret');
      return cookie.secret;
    },
  };
  return world;
}

export const reasonOf = (outcome: CommitOutcome) =>
  outcome.result.ok ? 'ok' : outcome.result.reason;

export const effectTypes = (outcome: CommitOutcome) =>
  outcome.effects.map((effect) => effect.type);
