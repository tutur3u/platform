import { DurableObject } from 'cloudflare:workers';
import type {
  ParsedStoreOp,
  StoreErrorCode,
  StoreResult,
} from '@tuturuuu/utils/mastermind-store/protocol';
import { createEngine, type StoreEngine, StoreError } from './engine';

export type StoreRunResult =
  | { ok: true; results: StoreResult[] }
  | { ok: false; error: StoreErrorCode };

/**
 * The single Mastermind store partition. Single-threaded, so each `run` is
 * atomic across every key it touches. Sets no alarms.
 */
export class MastermindStore extends DurableObject {
  private readonly engine: StoreEngine;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    this.engine = createEngine(ctx.storage.sql);
  }

  async run(ops: ParsedStoreOp[], budget: number): Promise<StoreRunResult> {
    const now = Date.now();
    this.engine.ensureSchema();
    try {
      const results = this.ctx.storage.transactionSync(() =>
        this.engine.run(ops, now, budget)
      );
      return { ok: true, results };
    } catch (error) {
      if (error instanceof StoreError) return { ok: false, error: error.code };
      throw error;
    }
  }

  async setFence(stopped: boolean) {
    this.engine.ensureSchema();
    this.engine.setStopped(stopped);
    return this.engine.status(Date.now(), 0).stopped;
  }

  async status(budget: number) {
    this.engine.ensureSchema();
    return this.engine.status(Date.now(), budget);
  }
}
