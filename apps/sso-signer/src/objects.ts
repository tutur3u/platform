import { DurableObject } from 'cloudflare:workers';
import {
  createBudgetStore,
  DEFAULT_DAILY_BUDGET,
  parseDailyBudget,
} from './budget-store';
import { createControlHandlers } from './control';
import { parseSignerEnvironment } from './environment';
import { type ClaimToken, createReplayStore } from './replay-store';
import type { Transaction } from './sql';
import type { Env } from './worker';

function transactionOf(ctx: DurableObjectState): Transaction {
  return (run) => ctx.storage.transactionSync(run);
}

/** `control:<env>`: the stop fence. */
export class SignerControl extends DurableObject<Env> {
  private readonly handlers;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.handlers = createControlHandlers({
      sql: ctx.storage.sql,
      secret: () => this.env.SSO_SIGNER_CONTROL_KEY,
      now: () => Date.now(),
    });
  }

  async fenceMode() {
    return this.handlers.fenceMode();
  }

  async readFence(key: unknown) {
    return this.handlers.readFence(key);
  }

  async setFence(key: unknown, mode: unknown, reason: unknown) {
    return this.handlers.setFence(key, mode, reason);
  }
}

/** `budget:<env>`: the daily cap on admitted sign requests. */
export class SignerBudget extends DurableObject<Env> {
  private readonly store;
  private invalidLogged = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = createBudgetStore(ctx.storage.sql, transactionOf(ctx));
  }

  async reserve() {
    let limit = parseDailyBudget(this.env.SSO_SIGNER_DAILY_BUDGET);
    if (limit === null) {
      if (!this.invalidLogged) {
        this.invalidLogged = true;
        console.error('[sso-signer] SSO_SIGNER_DAILY_BUDGET is malformed');
      }
      limit = DEFAULT_DAILY_BUDGET;
    }
    return this.store.reserve(Date.now(), limit);
  }
}

/** `replay:<env>`: single-use request nonces, permit IDs and transactions. */
export class SignerReplay extends DurableObject<Env> {
  private readonly store;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = createReplayStore(ctx.storage.sql, transactionOf(ctx));
  }

  async claim(tokens: ClaimToken[]) {
    return this.store.claim(tokens, Date.now());
  }
}

class SignerMisconfigured extends Error {
  constructor() {
    super('misconfigured');
    this.name = 'SignerMisconfigured';
  }
}

/** Throws the coded `SignerMisconfigured` when `SSO_SIGNER_ENV` is unknown. */
function named<T extends Rpc.DurableObjectBranded | undefined>(
  env: Env,
  namespace: DurableObjectNamespace<T>,
  prefix: string
) {
  const name = parseSignerEnvironment(env.SSO_SIGNER_ENV);
  if (!name) throw new SignerMisconfigured();
  return namespace.get(namespace.idFromName(`${prefix}:${name}`));
}

export const controlStub = (env: Env) =>
  named(env, env.SIGNER_CONTROL, 'control');
export const budgetStub = (env: Env) => named(env, env.SIGNER_BUDGET, 'budget');
export const replayStub = (env: Env) => named(env, env.SIGNER_REPLAY, 'replay');
