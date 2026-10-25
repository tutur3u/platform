import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import {
  PASSWORDS_BUCKET,
  PASSWORDS_MAX_CIPHERTEXT,
  PasswordsError,
  type PasswordsErrorCode,
  type PasswordsStorage,
  record,
  requireEnabled,
  rows,
  uuid,
} from '@tuturuuu/storage-core/vault/passwords-contract';
import type { PasswordsEnvironment } from './environment';
import type { VaultRpc } from './machine-repository';
import type { Scope } from './secrets-protocol';

const errors: Record<string, PasswordsErrorCode> = {
  '42501': 'FORBIDDEN',
  '22023': 'INVALID_INPUT',
  '40001': 'REVISION_CONFLICT',
  '23514': 'INVALID_INPUT',
  '23505': 'REVISION_CONFLICT',
  '54000': 'TOO_LARGE',
  '55000': 'REVISION_CONFLICT',
  P0002: 'NOT_FOUND',
};
export function createSecretsTransport(
  env: PasswordsEnvironment,
  request: Request,
  enabled: () => boolean
) {
  requireEnabled(enabled);
  if (!env.SUPABASE_SECRET_KEY?.trim() || !env.NEXT_PUBLIC_SUPABASE_URL?.trim())
    throw new PasswordsError('UNAVAILABLE');
  let attempts = 0;
  const client = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    {
      db: { retry: false },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (url, init) => {
          requireEnabled(enabled);
          if (request.signal.aborted || ++attempts > 96)
            throw new PasswordsError('UNAVAILABLE');
          return fetch(url, {
            ...init,
            redirect: 'error',
            cache: 'no-store',
            signal: AbortSignal.any([
              request.signal,
              AbortSignal.timeout(10000),
              ...(init?.signal ? [init.signal] : []),
            ]),
          }).then((response) => {
            let size = 0;
            const body = response.body?.pipeThrough(
              new TransformStream<Uint8Array, Uint8Array>({
                transform(chunk, controller) {
                  size += chunk.byteLength;
                  if (size > 12 * 1024 * 1024)
                    throw new PasswordsError('TOO_LARGE');
                  controller.enqueue(chunk);
                },
              })
            );
            return new Response(body, {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
            });
          });
        },
      },
    }
  );
  const rpc: VaultRpc = async (args) => {
    requireEnabled(enabled);
    const result = await client
      .schema('private')
      .rpc('password_vault_execute', args);
    if (result.error)
      throw new PasswordsError(
        errors[result.error.code] ?? 'OPERATION_UNCERTAIN'
      );
    requireEnabled(enabled);
    return record(result.data);
  };
  async function vault(scope: Scope, actor: string) {
    requireEnabled(enabled);
    const result = await client.schema('private').rpc('password_vault_list', {
      p_ws: scope.wsId,
      p_actor: uuid(actor),
      p_request: randomUUID(),
      p_limit: 32,
    });
    if (result.error)
      throw new PasswordsError(errors[result.error.code] ?? 'UNAVAILABLE');
    requireEnabled(enabled);
    const value = rows(record(result.data).vaults, 32).find(
      (v) => v.id === scope.vaultId
    );
    if (!value) throw new PasswordsError('FORBIDDEN');
    return value;
  }
  const storage: PasswordsStorage = {
    async upload(path, ciphertext) {
      requireEnabled(enabled);
      if (ciphertext.byteLength > PASSWORDS_MAX_CIPHERTEXT)
        throw new PasswordsError('TOO_LARGE');
      const result = await client.storage
        .from(PASSWORDS_BUCKET)
        .upload(path, ciphertext, {
          upsert: false,
          contentType: 'application/octet-stream',
          cacheControl: '0',
        });
      if (
        result.error ||
        !result.data ||
        result.data.path !== path ||
        result.data.fullPath !== `${PASSWORDS_BUCKET}/${path}`
      )
        throw new PasswordsError('OPERATION_UNCERTAIN');
      requireEnabled(enabled);
      return { id: uuid(result.data.id) };
    },
    async download(path) {
      requireEnabled(enabled);
      const result = await client.storage.from(PASSWORDS_BUCKET).download(path);
      if (result.error || !result.data) throw new PasswordsError('UNAVAILABLE');
      if (result.data.size > PASSWORDS_MAX_CIPHERTEXT)
        throw new PasswordsError('TOO_LARGE');
      requireEnabled(enabled);
      return new Uint8Array(await result.data.arrayBuffer());
    },
  };
  return { rpc, vault, storage };
}
