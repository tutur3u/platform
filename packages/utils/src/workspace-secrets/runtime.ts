/**
 * The workspace secrets Worker binding for server code, kept free of any
 * framework. Each app's framework adapter injects its Cloudflare service
 * binding (`WORKSPACE_SECRETS`) once per request with
 * `configureWorkspaceSecretsRuntime`; server helpers then read and write
 * credential-tier values through it.
 *
 * Without a binding (local development, tests, or a runtime that cannot hold
 * one), credential helpers use the caller's legacy plaintext path. That path
 * works only while private.workspace_secrets_migration_state
 * .enforce_credential_encryption is off; after the flip, writes fail closed
 * and new values are not readable from plaintext, which is why every
 * production credential reader must hold the binding first.
 */
import type {
  WorkspaceSecretPutInput,
  WorkspaceSecretPutResult,
  WorkspaceSecretRevealPurpose,
  WorkspaceSecretsBinding,
} from './protocol';

const RUNTIME_KEY = Symbol.for('tuturuuu.workspace-secrets.runtime');

interface RuntimeState {
  binding: WorkspaceSecretsBinding | null;
}

function state(): RuntimeState {
  const holder = globalThis as typeof globalThis & {
    [RUNTIME_KEY]?: RuntimeState;
  };
  holder[RUNTIME_KEY] ??= { binding: null };
  return holder[RUNTIME_KEY];
}

/** Installs (or with `null`, clears) the current Worker's binding. */
export function configureWorkspaceSecretsRuntime(
  binding: WorkspaceSecretsBinding | null | undefined
) {
  state().binding = binding ?? null;
}

export function getWorkspaceSecretsBinding(): WorkspaceSecretsBinding | null {
  return state().binding;
}

/** The Worker could not complete a request; the message names no value. */
export class WorkspaceSecretsUnavailableError extends Error {
  constructor(readonly status: string) {
    super(`workspace_secrets_${status}`);
    this.name = 'WorkspaceSecretsUnavailableError';
  }
}

/**
 * The value of one credential-tier secret for a server use, or `null` when
 * none is stored. `legacyRead` serves runtimes without the binding.
 */
export async function revealWorkspaceCredential(input: {
  wsId: string;
  name: string;
  purpose: WorkspaceSecretRevealPurpose;
  legacyRead: () => Promise<string | null>;
}): Promise<string | null> {
  const binding = getWorkspaceSecretsBinding();
  if (!binding) return input.legacyRead();

  const result = await binding.reveal({
    name: input.name,
    purpose: input.purpose,
    wsId: input.wsId,
  });
  if (result.status === 'ok') return result.value;
  if (result.status === 'not_found') return null;
  throw new WorkspaceSecretsUnavailableError(result.status);
}

/**
 * Writes one credential-tier value through the Worker. `legacyWrite` serves
 * runtimes without the binding and returns the same result shape.
 */
export async function putWorkspaceCredential(
  input: Omit<WorkspaceSecretPutInput, 'requestId'> & {
    requestId?: string;
    legacyWrite: () => Promise<WorkspaceSecretPutResult>;
  }
): Promise<WorkspaceSecretPutResult> {
  const binding = getWorkspaceSecretsBinding();
  if (!binding) return input.legacyWrite();

  const { legacyWrite: _legacyWrite, requestId, ...put } = input;
  return binding.put({ ...put, requestId: requestId ?? crypto.randomUUID() });
}
