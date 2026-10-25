import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getAppSessionClaimsFromRequest } from '@tuturuuu/auth/app-session-core';
import {
  PASSWORDS_BUCKET,
  PASSWORDS_MAX_CIPHERTEXT,
  PasswordsError,
  type PasswordsErrorCode,
  type PasswordsRepository,
  type PasswordsStorage,
  record,
  requireEnabled,
  rows,
  text,
  uuid,
} from '@tuturuuu/storage-core/vault/passwords-contract';
import { resolveWorkspaceId } from '@tuturuuu/utils/constants';
import type { PasswordsEnvironment } from './environment';
import { evaluateStepUp } from './step-up';
import { isPasswordsEnabled } from './stop-fence';

const SQL_ERRORS: Record<string, PasswordsErrorCode> = {
  '42501': 'FORBIDDEN',
  '22023': 'INVALID_INPUT',
  '40001': 'REVISION_CONFLICT',
  '23514': 'INVALID_INPUT',
  '23505': 'REVISION_CONFLICT',
  '54000': 'TOO_LARGE',
  '55000': 'REVISION_CONFLICT',
  P0002: 'NOT_FOUND',
};

function sqlFailure(error: { code?: string }, mutation: boolean): never {
  const code = error.code ?? '';
  const known = SQL_ERRORS[code];
  if (known) throw new PasswordsError(known);
  // Unknown transport failures cannot establish rollback. Never serialize SQL details.
  throw new PasswordsError(mutation ? 'OPERATION_UNCERTAIN' : 'UNAVAILABLE');
}

/** One client per request, with actor filters derived exclusively from signed claims.
 * App-session tokens are not Supabase JWTs. SQL repeats these explicit membership
 * checks; this adapter makes no claim of end-user RLS execution.
 */
export function createPasswordsDatabase(
  env: PasswordsEnvironment,
  request: Request
) {
  const enabled = () => isPasswordsEnabled(env);
  let client: SupabaseClient | undefined;

  function principal(fresh = false) {
    requireEnabled(enabled);
    if (!env.TUTURUUU_APP_COORDINATION_SECRET?.trim())
      throw new PasswordsError('UNAVAILABLE');
    const claims = getAppSessionClaimsFromRequest(request, {
      targetApp: 'passwords',
      secret: env.TUTURUUU_APP_COORDINATION_SECRET,
    });
    if (!claims) throw new PasswordsError('UNAUTHENTICATED');
    uuid(claims.sub);
    if (fresh && !evaluateStepUp(claims.mfa).fresh)
      throw new PasswordsError('STEP_UP_REQUIRED');
    return claims;
  }

  function db() {
    principal();
    if (
      !env.SUPABASE_SECRET_KEY?.trim() ||
      !env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    )
      throw new PasswordsError('UNAVAILABLE');
    client ??= createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.SUPABASE_SECRET_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: {
          fetch: (input, init) => {
            requireEnabled(enabled);
            return fetch(input, {
              ...init,
              signal: AbortSignal.any([
                request.signal,
                AbortSignal.timeout(15000),
                ...(init?.signal ? [init.signal] : []),
              ]),
            });
          },
        },
      }
    );
    return client;
  }

  async function proveWorkspace(wsId: string) {
    const actor = principal().sub;
    uuid(wsId);
    const sb = db();
    const workspace = await sb
      .from('workspaces')
      .select('id, name, deleted, workspace_members!inner(user_id, type)')
      .eq('id', wsId)
      .eq('workspace_members.user_id', actor)
      .eq('workspace_members.type', 'MEMBER')
      .maybeSingle();
    if (workspace.error) throw new PasswordsError('UNAVAILABLE');
    if (
      !workspace.data ||
      workspace.data.id !== wsId ||
      (workspace.data.deleted !== false && workspace.data.deleted !== null)
    )
      throw new PasswordsError('FORBIDDEN');
    const members = rows(workspace.data.workspace_members, 1);
    if (
      members.length !== 1 ||
      members[0]?.user_id !== actor ||
      members[0]?.type !== 'MEMBER'
    )
      throw new PasswordsError('FORBIDDEN');
    const auth = await sb.auth.admin.getUserById(actor);
    if (auth.error) throw new PasswordsError('UNAVAILABLE');
    if (!auth.data.user || auth.data.user.id !== actor)
      throw new PasswordsError('FORBIDDEN');
    const bannedUntil = record(auth.data.user).banned_until;
    if (
      bannedUntil != null &&
      (typeof bannedUntil !== 'string' ||
        !Number.isFinite(Date.parse(bannedUntil)) ||
        Date.parse(bannedUntil) > Date.now())
    )
      throw new PasswordsError('FORBIDDEN');
    const archive = await sb
      .from('workspace_user_linked_users')
      .select('virtual_user_id, workspace_users!inner(archived)')
      .eq('ws_id', wsId)
      .eq('platform_user_id', actor)
      .eq('workspace_users.archived', true)
      .limit(1);
    if (archive.error) throw new PasswordsError('UNAVAILABLE');
    if (!Array.isArray(archive.data) || archive.data.length !== 0)
      throw new PasswordsError('FORBIDDEN');
    principal();
    return {
      actor,
      name: workspace.data.name == null ? null : text(workspace.data.name),
    };
  }

  async function resolveWorkspace(identifier: string) {
    const actor = principal().sub;
    if (
      typeof identifier !== 'string' ||
      identifier.length > 64 ||
      !identifier.trim()
    )
      throw new PasswordsError('INVALID_INPUT');
    const resolved = resolveWorkspaceId(identifier.trim().toLowerCase());
    let wsId: string;
    if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(resolved)) {
      wsId = uuid(resolved);
    } else {
      let query = db()
        .from('workspaces')
        .select('id, workspace_members!inner(user_id, type)')
        .eq('workspace_members.user_id', actor)
        .eq('workspace_members.type', 'MEMBER');
      query =
        resolved === 'personal'
          ? query.eq('personal', true)
          : query.eq('handle', resolved);
      const result = await query.maybeSingle();
      if (result.error) throw new PasswordsError('UNAVAILABLE');
      if (!result.data) throw new PasswordsError('FORBIDDEN');
      wsId = uuid(result.data.id);
    }
    return { wsId, ...(await proveWorkspace(wsId)) };
  }

  const repository: PasswordsRepository = {
    async list(wsId) {
      const { actor } = await proveWorkspace(wsId);
      const result = await db().schema('private').rpc('password_vault_list', {
        p_ws: wsId,
        p_actor: actor,
        p_request: randomUUID(),
        p_limit: 32,
      });
      if (result.error) sqlFailure(result.error, false);
      principal();
      return record(result.data);
    },
    async execute(scope, requestId, action, input) {
      const { actor } = await proveWorkspace(scope.wsId);
      uuid(scope.vaultId);
      uuid(requestId);
      const result = await db()
        .schema('private')
        .rpc('password_vault_execute', {
          p_ws: scope.wsId,
          p_vault: scope.vaultId,
          p_actor: actor,
          p_request: requestId,
          p_action: action,
          p_input: input,
        });
      if (result.error) sqlFailure(result.error, true);
      principal();
      return record(result.data);
    },
  };

  async function storage(path: string) {
    const segments = path.split('/');
    if (segments.length !== 5 || !/^[1-9][0-9]{0,3}$/.test(segments[2] ?? ''))
      throw new PasswordsError('INVALID_INPUT');
    for (const index of [0, 1, 3, 4]) uuid(segments[index]);
    await proveWorkspace(uuid(segments[0]));
    return db().storage.from(PASSWORDS_BUCKET);
  }

  const files: PasswordsStorage = {
    async upload(path, ciphertext) {
      if (ciphertext.byteLength > PASSWORDS_MAX_CIPHERTEXT)
        throw new PasswordsError('TOO_LARGE');
      const bucket = await storage(path);
      let result: Awaited<ReturnType<typeof bucket.upload>>;
      try {
        result = await bucket.upload(path, ciphertext, {
          upsert: false,
          contentType: 'application/octet-stream',
          cacheControl: '0',
        });
      } catch {
        throw new PasswordsError('OPERATION_UNCERTAIN');
      }
      if (
        result.error ||
        !result.data ||
        result.data.path !== path ||
        result.data.fullPath !== `${PASSWORDS_BUCKET}/${path}`
      )
        throw new PasswordsError('OPERATION_UNCERTAIN');
      principal();
      try {
        return { id: uuid(result.data.id) };
      } catch {
        throw new PasswordsError('OPERATION_UNCERTAIN');
      }
    },
    async download(path) {
      const bucket = await storage(path);
      const result = await bucket.download(path);
      if (result.error || !result.data) throw new PasswordsError('UNAVAILABLE');
      if (result.data.size > PASSWORDS_MAX_CIPHERTEXT)
        throw new PasswordsError('TOO_LARGE');
      principal();
      return new Uint8Array(await result.data.arrayBuffer());
    },
  };

  async function workspaceMembers(wsId: string) {
    await proveWorkspace(wsId);
    const result = await db()
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('type', 'MEMBER')
      .order('user_id')
      .limit(100);
    if (result.error) throw new PasswordsError('UNAVAILABLE');
    return rows(result.data, 100).map((row) => ({
      userId: uuid(row.user_id),
      displayName: null,
    }));
  }

  return {
    repository,
    storage: files,
    principal,
    resolveWorkspace,
    workspaceMembers,
    enabled,
  };
}

export type PasswordsDatabase = ReturnType<typeof createPasswordsDatabase>;
