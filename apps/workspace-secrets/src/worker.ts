/**
 * tuturuuu-workspace-secrets: credential-tier workspace secrets
 * (apps/docs/platform/architecture/workspace-secrets-encryption.mdx).
 *
 * There is no HTTP surface: `fetch` answers 404. Callers bind to one named
 * entrypoint, and that entrypoint fixes the caller id that selects the
 * allowlist in ./policy.ts.
 */
import { WorkerEntrypoint } from 'cloudflare:workers';
import { createDb, type DbEnv } from './db';
import type { KekEnv } from './kek';
import type { CallerId } from './policy';
import {
  credentialKeyStatus,
  type PutInput,
  putCredential,
  type RenameInput,
  renameCredential,
  revealCredential,
  type RevealInput,
} from './service';

export type Env = DbEnv & KekEnv;

function deps(env: Env) {
  return { db: createDb(env), env };
}

abstract class CallerEntrypoint extends WorkerEntrypoint<Env> {
  protected abstract readonly caller: CallerId;

  put(input: PutInput) {
    return putCredential(deps(this.env), this.caller, input);
  }

  rename(input: RenameInput) {
    return renameCredential(deps(this.env), this.caller, input);
  }

  reveal(input: RevealInput) {
    return revealCredential(deps(this.env), this.caller, input);
  }

  keyStatus(input: { wsId: string; keyId: string }) {
    return credentialKeyStatus(deps(this.env), this.caller, input);
  }
}

export class WebSecrets extends CallerEntrypoint {
  protected readonly caller = 'web' as const;
}

export class AdminSecrets extends CallerEntrypoint {
  protected readonly caller = 'admin' as const;
}

export class StorageSecrets extends CallerEntrypoint {
  protected readonly caller = 'storage' as const;
}

export class KeyStatusSecrets extends CallerEntrypoint {
  protected readonly caller = 'key-status' as const;
}

export default {
  fetch() {
    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
