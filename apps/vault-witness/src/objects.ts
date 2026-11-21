import { DurableObject } from 'cloudflare:workers';
import { parseSigner, type WitnessEnv } from './config';
import { createKeyringEngine, type KeyringEngine } from './keyring-engine';
import type { AppendRequest } from './vault-append';
import { createVaultEngine, type VaultEngine } from './vault-engine';

const MISCONFIGURED = {
  ok: false as const,
  error: 'misconfigured' as const,
};

export type VaultCall =
  | {
      op: 'init';
      input: Parameters<VaultEngine['init']>[0];
      deployment: string;
    }
  | { op: 'challenge' }
  | { op: 'attest'; input: Parameters<VaultEngine['attest']>[0] }
  | { op: 'append'; input: AppendRequest }
  | { op: 'transitions'; input: Parameters<VaultEngine['transitions']>[0] }
  | { op: 'audit'; input: Parameters<VaultEngine['audit']>[0] }
  | { op: 'confirm'; input: unknown };

/**
 * One vault's witness. Single-threaded, so each call is one atomic
 * transaction over this vault's storage. It schedules no alarms and makes no
 * outbound calls.
 */
export class VaultWitness extends DurableObject<WitnessEnv> {
  private engine: VaultEngine | null = null;

  private load(): VaultEngine | null {
    if (this.engine) return this.engine;
    const signer = parseSigner(this.env.WITNESS_SIGNING_KEY);
    if (!signer) return null;
    this.engine = createVaultEngine(this.ctx.storage.sql, signer);
    return this.engine;
  }

  async call(call: VaultCall) {
    const engine = this.load();
    if (!engine) return MISCONFIGURED;
    const now = Date.now();
    try {
      return this.ctx.storage.transactionSync(() => {
        switch (call.op) {
          case 'init':
            return engine.init(call.input, call.deployment, now);
          case 'challenge':
            return engine.challenge(now);
          case 'attest':
            return engine.attest(call.input, now);
          case 'append':
            return engine.append(call.input, now);
          case 'transitions':
            return engine.transitions(call.input, now);
          case 'audit':
            return engine.audit(call.input, now);
          case 'confirm':
            return engine.confirm(call.input, now);
        }
      });
    } catch (error) {
      // The transaction rolled back; drop caches derived from it.
      engine.invalidate();
      throw error;
    }
  }
}

export type KeyringCall =
  | { op: 'put'; input: Parameters<KeyringEngine['put']>[0] }
  | { op: 'attest'; input: Parameters<KeyringEngine['attest']>[0] }
  | { op: 'confirm'; input: Parameters<KeyringEngine['confirm']>[0] };

/** One user's keyring authority; see `keyring-engine.ts`. */
export class KeyringWitness extends DurableObject<WitnessEnv> {
  private engine: KeyringEngine | null = null;

  async call(call: KeyringCall) {
    if (!this.engine) {
      const signer = parseSigner(this.env.WITNESS_SIGNING_KEY);
      if (!signer) return MISCONFIGURED;
      this.engine = createKeyringEngine(this.ctx.storage.sql, signer);
    }
    const engine = this.engine;
    const now = Date.now();
    return this.ctx.storage.transactionSync(() => {
      switch (call.op) {
        case 'put':
          return engine.put(call.input, now);
        case 'attest':
          return engine.attest(call.input, now);
        case 'confirm':
          return engine.confirm(call.input, now);
      }
    });
  }
}
