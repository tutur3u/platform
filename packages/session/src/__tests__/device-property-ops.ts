/**
 * The random operations of the device property tests: every mutation kind,
 * with valid, stale and malformed variants, plus `resolve`, replays, the
 * drain, cookie settlement, epoch bumps and their (re)delivered fan-outs,
 * and time. Test-only by path.
 */
import {
  type CommitOutcome,
  type DeviceMutation,
  type GrantAct,
  type JsonValue,
  leaseDecision,
  resolve,
  runDrain,
  settleResponseCookie,
  type SessionFactor,
} from '../device';
import type { UserId } from '../principal';
import { testHashSecret } from './device-fakes';
import { ACT_PARAMS, REGISTRY, stepUpRouteFor, T0 } from './device-fixtures';
import { checkResolve, checkSignInIndex } from './device-invariants';
import {
  currentOrStaleFence,
  epochFor,
  freshRead,
  type Model,
  STEP_UP_ACTS,
  USERS,
} from './device-property';

const MAX_RUN_MS = 6 * 24 * 60 * 60_000;
const READ_ROUTES = ['app.read', 'app.public_read'];
const ROUTES = [
  ...READ_ROUTES,
  'app.write',
  'auth.ai_token.mint',
  'auth.handoff.mint',
  'nowhere',
];
const FACTOR_ACT_LIST: GrantAct[] = [
  'account.mfa.enroll',
  'account.mfa.remove',
  'account.mfa.reset',
  'account.passkey.enroll',
  'account.passkey.remove',
  'account.password',
];

function activeRow(model: Model) {
  const state = model.memory.state;
  return state.activeSid ? state.sessions[state.activeSid] : undefined;
}

function activeUser(model: Model): UserId {
  return (activeRow(model)?.userId ?? model.random.pick(USERS)) as UserId;
}

function anySessionId(model: Model): string {
  const ids = Object.keys(model.memory.state.sessions);
  return ids.length > 0 && model.random.bool(0.9)
    ? model.random.pick(ids)
    : 'missing-sid';
}

async function settle(model: Model, outcome: CommitOutcome) {
  await model.runEffects(outcome);
  return outcome;
}

/** The act's parameters, consistent with the acting session's factors most of the time. */
function paramsFor(model: Model, act: GrantAct, serial: number): JsonValue {
  const row = activeRow(model);
  const factors: SessionFactor[] = row?.factors ?? [];
  const ids = (keep: (factor: SessionFactor) => boolean) =>
    factors.filter(keep).map((factor) => factor.factorId);
  const userId = row?.userId ?? model.random.pick(USERS);
  switch (act) {
    case 'account.mfa.enroll':
      return {
        factorType: model.random.pick(['totp', 'passkey']),
        factorId: `mfa-${serial}`,
      };
    case 'account.passkey.enroll':
      return { credentialId: `pk-${serial}` };
    case 'account.mfa.remove': {
      const held = ids((factor) => factor.role === 'second_factor');
      return { factorIds: held.length > 0 ? held.slice(0, 1) : ['ghost'] };
    }
    case 'account.mfa.reset': {
      const held = (model.factors[userId] ?? []).filter(
        (f) => f.role === 'second_factor'
      );
      return {
        factorIds: held.length > 0 ? held.map((f) => f.factorId) : ['ghost'],
      };
    }
    case 'account.passkey.remove': {
      const held = ids(
        (factor) => factor.method === 'passkey' && factor.role === 'sign_in'
      );
      return { credentialIds: held.length > 0 ? held : ['ghost'] };
    }
    case 'account.password':
      return { passwordChangeId: `pw-${serial}` };
    case 'account.delete':
    case 'sessions.revoke_all':
      return { userId };
    case 'api_keys.create':
      return { workspaceId: 'ws', keyName: `k${serial % 3}`, role: 'member' };
    case 'cli.approve':
      return { userCode: `code-${serial % 2}`, clientId: 'cli' };
    default:
      return serial % 17 === 0 ? { unexpected: true } : ACT_PARAMS[act];
  }
}

/** A step-up: grant, then a consume or a factor commit on the same or another route. */
async function stepUp(model: Model) {
  // A signed-out page signs in before it steps up.
  if (!activeRow(model) && !model.nested() && model.random.bool(0.8))
    await signIn(model);
  const serial = model.random.int(1_000);
  const act = model.random.bool(0.5)
    ? model.random.pick(FACTOR_ACT_LIST)
    : model.random.pick(STEP_UP_ACTS);
  const params = paramsFor(model, act, serial);
  const userId = activeUser(model);
  const granted = await settle(
    model,
    await model.commit({
      kind: 'grant_step_up',
      operationId: model.nextOp(),
      nowMs: model.now,
      fence: currentOrStaleFence(model),
      route: model.random.bool(0.95) ? stepUpRouteFor(act) : 'app.write',
      params,
      epoch: epochFor(model, userId),
    })
  );
  const grantId =
    granted.result.ok && granted.result.grantId
      ? granted.result.grantId
      : 'no-grant';
  if (grantId !== 'no-grant') model.grants.push({ grantId, act, params });
  if (model.random.bool(0.3)) model.now += model.random.int(400_000);
  // Usually the same act and parameters; sometimes another act, or other parameters.
  const useAct = model.random.bool(0.85)
    ? act
    : model.random.pick(STEP_UP_ACTS);
  const useParams = model.random.bool(0.9)
    ? params
    : paramsFor(model, useAct, serial + 1);
  if (FACTOR_ACT_LIST.includes(useAct)) {
    await recordFactors(model, useAct, grantId, useParams);
  } else {
    await settle(
      model,
      await model.commit({
        kind: 'consume_step_up',
        operationId: model.nextOp(),
        nowMs: model.now,
        fence: currentOrStaleFence(model),
        route: stepUpRouteFor(useAct),
        grantId,
        params: useParams,
        epoch: epochFor(model, activeUser(model)),
      })
    );
  }
  // A second spend at once, before anything moves the generation.
  if (model.random.bool(0.3)) await spendAgain(model, model.grants.at(-1));
}

async function recordFactors(
  model: Model,
  act: GrantAct,
  grantId: string,
  params: JsonValue
) {
  const userId = activeUser(model);
  const change = [
    'account.mfa.remove',
    'account.mfa.reset',
    'account.passkey.remove',
    'account.password',
  ].includes(act);
  if (change && grantId !== 'no-grant' && model.random.bool(0.9)) {
    // UserSessions bumps the epoch first and owns the fan-out.
    bumpEpoch(model, userId);
  }
  const epoch = model.epochs[userId] ?? 0;
  const out = await settle(
    model,
    await model.commit({
      kind: 'record_factors',
      operationId: model.nextOp(),
      nowMs: model.now,
      fence: currentOrStaleFence(model),
      route: stepUpRouteFor(act),
      grantId,
      params,
      credentialChange:
        change && model.random.bool(0.95) ? { newEpoch: epoch } : null,
      epoch: epochFor(model, userId),
      factors:
        act === 'account.mfa.reset'
          ? freshRead(userId, model.now, model.factors[userId] ?? [])
          : null,
    })
  );
  const row = activeRow(model);
  if (out.result.ok && row)
    model.factors[row.userId] = row.factors.map((f) => ({ ...f }));
}

/** Spends a grant issued earlier again, under a new operation id. */
async function spendAgain(
  model: Model,
  issued = model.grants.length > 0 ? model.random.pick(model.grants) : undefined
) {
  if (!issued) return;
  const { grantId, act, params } = issued;
  if (FACTOR_ACT_LIST.includes(act)) {
    await recordFactors(model, act, grantId, params);
    return;
  }
  await settle(
    model,
    await model.commit({
      kind: 'consume_step_up',
      operationId: model.nextOp(),
      nowMs: model.now,
      fence: currentOrStaleFence(model),
      route: stepUpRouteFor(act),
      grantId,
      params,
      epoch: epochFor(model, activeUser(model)),
    })
  );
}

function bumpEpoch(model: Model, userId: UserId) {
  const next = (model.epochs[userId] ?? 0) + 1;
  model.epochs[userId] = next;
  model.fanOuts.push({ userId, belowEpoch: next, bumpedAtMs: model.now });
}

async function deliverFanOut(model: Model) {
  if (model.fanOuts.length === 0) return;
  // Delivery order is arbitrary and a delivery may repeat.
  const at = model.random.int(model.fanOuts.length);
  const fanOut = model.fanOuts[at] as Model['fanOuts'][number];
  if (model.random.bool(0.7)) model.fanOuts.splice(at, 1);
  await settle(
    model,
    await model.commit({
      kind: 'revoke_user_below_epoch',
      operationId: model.nextOp(),
      nowMs: model.now,
      ...fanOut,
    })
  );
}

async function slotRevoke(model: Model) {
  const rows = Object.values(model.memory.state.sessions);
  const row = rows.length > 0 ? model.random.pick(rows) : undefined;
  // Sometimes a real slot id named for another user, which must spare this user's sessions.
  const userId =
    row && model.random.bool(0.8) ? row.userId : model.random.pick(USERS);
  const reservationId =
    row && model.random.bool(0.85)
      ? row.reservationId
      : `never-${model.random.int(9)}`;
  // The index evicted this slot: it is gone from this device's index entry.
  const slots = model.index.slots.get(userId);
  for (const [deviceId, slot] of slots ?? []) {
    if (slot.reservationId === reservationId) slots?.delete(deviceId);
  }
  await settle(
    model,
    await model.commit({
      kind: 'revoke_user_on_device',
      operationId: model.nextOp(),
      nowMs: model.now,
      userId,
      reservationId,
    })
  );
}

async function signIn(model: Model) {
  const userId = model.random.pick(USERS);
  const out = await model.signIn(userId);
  const record = model.commits.at(-1);
  if (
    out.result.ok === false &&
    out.result.reason === 'unavailable' &&
    record
  ) {
    // The 60-second lease settles a sign-in whose outcome the flow never learned.
    const decision = await leaseDecision(
      model.memory.store,
      record.mutation.operationId
    );
    const reserved = record.reserved;
    if (
      reserved &&
      (reserved.kind === 'reserved' || reserved.kind === 'swap')
    ) {
      if (decision === 'confirm')
        await model.index.port.confirm(reserved.reservation);
      else await model.index.port.release(reserved.reservation);
    }
  }
  if (record) checkSignInIndex(model, record);
  await settle(model, out);
}

async function redeemChild(model: Model) {
  const row = activeRow(model);
  if (row && row.kind !== 'child' && model.random.bool(0.6)) {
    model.codes.push({
      sid: row.sid,
      gen: model.memory.state.gen,
      epoch: model.epochs[row.userId] ?? 0,
    });
  }
  if (model.codes.length === 0) return;
  const code = model.random.pick(model.codes);
  const parent = model.memory.state.sessions[code.sid];
  const userId = (parent?.userId ?? model.random.pick(USERS)) as UserId;
  await settle(
    model,
    await model.commit({
      kind: 'redeem_child',
      operationId: model.nextOp(),
      nowMs: model.now,
      codeParent: code,
      child: { host: 'app.example.test', callback: '/done', kind: 'child' },
      epoch: epochFor(model, userId),
    })
  );
}

async function resolveAndTouch(model: Model) {
  const state = model.memory.state;
  const secret =
    model.secrets.length > 0 && model.random.bool(0.9)
      ? model.random.pick(model.secrets)
      : new Uint8Array(32).fill(9);
  const route = model.random.pick(ROUTES);
  const userId = activeUser(model);
  const input = {
    secretHash: await testHashSecret(secret),
    route,
    expectedSessionId: model.random.bool(0.85)
      ? state.activeSid
      : model.random.bool(0.5)
        ? null
        : anySessionId(model),
    epoch: model.random.bool(0.8) ? epochFor(model, userId) : null,
    epochCache: await model.store.readEpochCache(),
    nowMs: model.now,
  };
  const result = checkResolve(model, () => resolve(state, input, REGISTRY));
  if (result.kind === 'resolved') {
    if (result.refreshEpoch)
      await model.store.refreshEpochCache(result.refreshEpoch, model.now);
    if (result.touch) await model.store.touch(result.sessionId, model.now);
  } else if (result.kind === 'signed_out' && result.epochRevoke) {
    // The host commits the revocation `resolve` named.
    await settle(
      model,
      await model.commit({
        kind: 'revoke_user_below_epoch',
        operationId: model.nextOp(),
        nowMs: model.now,
        ...result.epochRevoke,
      })
    );
  }
}

async function replay(model: Model) {
  // A sign-in that never reserved built no mutation to replay.
  const recorded = model.commits.filter(
    ({ mutation }) =>
      mutation.kind !== 'sign_in' ||
      (mutation as { reservation?: unknown }).reservation !== undefined
  );
  if (recorded.length === 0) return;
  const { mutation } = model.random.pick(recorded);
  // The same operation id and body, delivered again later.
  await settle(
    model,
    await model.commit({ ...mutation, nowMs: model.now } as DeviceMutation)
  );
}

/** Time moves forward, staying within the 7 days a security record id is kept. */
async function advance(model: Model) {
  const step = model.random.pick([
    1_000,
    20_000,
    61_000,
    400_000,
    3_600_000,
    26 * 3_600_000,
  ]);
  if (model.now + step - T0 < MAX_RUN_MS) model.now += step;
}

const OPS: [number, (model: Model) => Promise<void>][] = [
  [12, signIn],
  [
    5,
    async (model) => {
      const state = model.memory.state;
      const saved = Object.values(state.sessions).filter(
        (row) =>
          row.kind !== 'child' &&
          row.revokedAt === null &&
          row.sid !== state.activeSid
      );
      const target =
        saved.length > 0 && model.random.bool(0.8)
          ? model.random.pick(saved).sid
          : anySessionId(model);
      await settle(
        model,
        await model.commit({
          kind: 'switch',
          operationId: model.nextOp(),
          nowMs: model.now,
          fence: currentOrStaleFence(model),
          targetSessionId: target,
          epoch: epochFor(
            model,
            (model.memory.state.sessions[target]?.userId ??
              activeUser(model)) as UserId
          ),
        })
      );
    },
  ],
  [
    5,
    async (model) => {
      await settle(
        model,
        await model.commit({
          kind: 'rotate',
          operationId: model.nextOp(),
          nowMs: model.now,
          fence: currentOrStaleFence(model),
          epoch: epochFor(model, activeUser(model)),
        })
      );
    },
  ],
  [14, stepUp],
  [5, redeemChild],
  [4, (model) => spendAgain(model)],
  [
    3,
    async (model) => {
      const state = model.memory.state;
      const own = state.activeSid ?? anySessionId(model);
      const logout = model.random.bool(0.4);
      await settle(
        model,
        await model.commit({
          kind: 'revoke',
          operationId: model.nextOp(),
          nowMs: model.now,
          fence: logout ? null : currentOrStaleFence(model),
          sessionId: logout ? own : anySessionId(model),
          reason: logout ? 'logout' : 'user',
        })
      );
      if (model.random.bool(0.5)) {
        await model.housekeeping(() =>
          settleResponseCookie(model.store, model.now, { kind: 'device' })
        );
      }
    },
  ],
  [1, async (model) => bumpEpoch(model, model.random.pick(USERS))],
  [4, deliverFanOut],
  [3, slotRevoke],
  [6, replay],
  [12, resolveAndTouch],
  [
    3,
    async (model) => {
      if (model.random.bool(0.3)) model.upstream.failNext(model.random.int(3));
      if (model.random.bool(0.3))
        model.issuers.ai_token.failNext(model.random.int(3));
      await model.housekeeping(() =>
        runDrain(
          model.store,
          {
            upstream: model.upstream.port,
            issuers: {
              ai_token: model.issuers.ai_token.issuer,
              handoff_code: model.issuers.handoff_code.issuer,
            },
          },
          model.now
        )
      );
    },
  ],
  [
    2,
    async (model) =>
      void (await model.housekeeping(() =>
        settleResponseCookie(model.store, model.now, { kind: 'device' })
      )),
  ],
  [8, advance],
];

/**
 * One weighted random operation. A concurrent one, run between another
 * mutation's read and write, neither signs in (two sign-ins racing on one
 * device share an index slot, which the index object owns) nor moves time.
 */
export async function randomOp(
  model: Model,
  concurrent = false
): Promise<void> {
  const ops = concurrent
    ? OPS.filter(([, op]) => op !== signIn && op !== advance)
    : OPS;
  const total = ops.reduce((sum, [weight]) => sum + weight, 0);
  let roll = model.random.int(total);
  for (const [weight, op] of ops) {
    if (roll < weight) return op(model);
    roll -= weight;
  }
}
