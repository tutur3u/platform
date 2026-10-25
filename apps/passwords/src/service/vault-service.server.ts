import {
  decodeValue,
  integer,
  PASSWORDS_MAX_ITEMS,
  PasswordsError,
  type PasswordsRecord,
  record,
  requireEnabled,
  role,
  text,
  uuid,
} from '@tuturuuu/storage-core/vault/passwords-contract';
import { PasswordsVaultEngine } from '@tuturuuu/storage-core/vault/passwords-engine';
import { workspaceKeyWrapper } from '@tuturuuu/storage-core/vault/workspace-key-wrapper';
import {
  createPasswordsDatabase,
  type PasswordsDatabase,
} from './database.server';
import type { PasswordsEnvironment } from './environment';
import {
  AUDIT_EVENT_TYPES,
  type AuditEventType,
  PASSWORDS_ERROR_CODES,
  PASSWORDS_LIMITS,
  type PasswordsResult,
  type PasswordsServicePort,
  type PasswordsState,
  type StepUpStatus,
  type VaultSummary,
} from './port';
import { createSecretsHandler } from './secrets-adapter.server';
import { AGENT_CREDENTIALS_PATH, CREDENTIALS_PATH } from './secrets-protocol';
import { evaluateStepUp } from './step-up';

export function passwordsStepUpUrl(
  request: Request,
  env: PasswordsEnvironment
) {
  const app = new URL(env.NEXT_PUBLIC_APP_URL);
  const current = new URL(request.url);
  const referrer = request.headers.get('referer');
  let candidate = current;
  if (referrer) {
    try {
      candidate = new URL(referrer);
    } catch {
      candidate = current;
    }
  }
  const locale = /^\/vi(?:\/|$)/.test(candidate.pathname) ? 'vi' : 'en';
  const next = new URL(`/${locale}`, app);
  if (
    candidate.origin === app.origin &&
    /^\/(en|vi)(?:\/[a-zA-Z0-9-]{1,64})?\/?$/.test(candidate.pathname)
  )
    next.pathname = candidate.pathname;
  const entrypoint = new URL('/api/auth/step-up', app);
  entrypoint.searchParams.set('next', next.pathname);
  return entrypoint.href;
}

function summary(vault: PasswordsRecord): VaultSummary {
  if (typeof vault.rotation_required !== 'boolean')
    throw new PasswordsError('UNAVAILABLE');
  return {
    id: uuid(vault.id),
    name: text(vault.label, 128),
    role: role(vault.role),
    revision: integer(vault.revision, 1),
    keyVersion: integer(vault.active_version, 1, 1000),
    rotationRequired: vault.rotation_required,
  };
}

export function createPasswordsService(
  request: Request,
  env: PasswordsEnvironment,
  database: PasswordsDatabase = createPasswordsDatabase(env, request)
): PasswordsServicePort {
  function createEngine(committed: () => void) {
    return new PasswordsVaultEngine({
      repository: {
        list: (wsId) => database.repository.list(wsId),
        execute: async (scope, requestId, action, input) => {
          const value = await database.repository.execute(
            scope,
            requestId,
            action,
            input
          );
          if (
            [
              'vault.create',
              'item.write',
              'member.set',
              'vault.rotate',
            ].includes(action)
          )
            committed();
          return value;
        },
      },
      storage: database.storage,
      enabled: database.enabled,
      authorize: async (_wsId, fresh) => {
        database.principal(fresh);
      },
      keyWrapper: {
        wrap: (key) => workspaceKeyWrapper(env.ENCRYPTION_MASTER_KEY).wrap(key),
        unwrap: (key) =>
          workspaceKeyWrapper(env.ENCRYPTION_MASTER_KEY).unwrap(key),
      },
    });
  }

  function stepUp(): StepUpStatus {
    const proof = evaluateStepUp(database.principal().mfa);
    return proof.fresh
      ? {
          state: 'valid',
          expiresAt: new Date(proof.expiresAtSeconds * 1000).toISOString(),
        }
      : { state: 'required', url: passwordsStepUpUrl(request, env) };
  }

  function mutationRequest() {
    if (request.method !== 'POST') throw new PasswordsError('FORBIDDEN');
    const app = new URL(env.NEXT_PUBLIC_APP_URL);
    if (new URL(request.url).origin !== app.origin)
      throw new PasswordsError('FORBIDDEN');
    if (
      request.headers.get('origin') !== app.origin ||
      request.headers.has('authorization')
    )
      throw new PasswordsError('FORBIDDEN');
  }

  async function run<T>(
    write: boolean,
    work: (engine: PasswordsVaultEngine) => Promise<T>
  ): Promise<PasswordsResult<T>> {
    let committed = false;
    try {
      requireEnabled(database.enabled);
      database.principal();
      if (write) mutationRequest();
      const value = await work(
        createEngine(() => {
          committed = true;
        })
      );
      if (write) committed = true;
      requireEnabled(database.enabled);
      return { ok: true, value };
    } catch (error) {
      const code =
        write && committed
          ? 'OPERATION_UNCERTAIN'
          : error instanceof PasswordsError
            ? error.code
            : write
              ? 'OPERATION_UNCERTAIN'
              : 'UNAVAILABLE';
      if (code === 'STEP_UP_REQUIRED') {
        try {
          return {
            ok: false,
            code,
            stepUpUrl: passwordsStepUpUrl(request, env),
          };
        } catch {
          return { ok: false, code: 'UNAVAILABLE' };
        }
      }
      return { ok: false, code };
    }
  }

  return {
    observeOperation: (input) =>
      run(false, async (engine) => {
        const workspace = await database.resolveWorkspace(input.wsId);
        const observation = await engine.observeOperation({
          ...input,
          wsId: workspace.wsId,
        });
        if (
          observation.found &&
          !AUDIT_EVENT_TYPES.some((type) => type === observation.action)
        )
          throw new PasswordsError('UNAVAILABLE');
        return observation;
      }),
    state: (input) =>
      run(false, async (engine): Promise<PasswordsState> => {
        const workspace = await database.resolveWorkspace(input.wsId);
        const vaults = (await engine.vaults(workspace.wsId)).map(summary);
        const selected = input.vaultId
          ? vaults.find((v) => v.id === uuid(input.vaultId))
          : vaults[0];
        if (input.vaultId && !selected) throw new PasswordsError('FORBIDDEN');
        const state: PasswordsState = {
          workspaceName: workspace.name,
          vaults,
          vault: null,
          stepUp: stepUp(),
        };
        if (!selected) return state;
        const scope = { wsId: workspace.wsId, vaultId: selected.id };
        const items = await engine.items(scope);
        if (items.length <= PASSWORDS_MAX_ITEMS)
          selected.itemCount = items.length;
        state.vault = {
          summary: selected,
          items: items.slice(0, PASSWORDS_MAX_ITEMS).map((item) => ({
            id: uuid(item.id),
            name: text(item.name, 128),
            version: integer(item.version, 1, 1000),
          })),
          members: [],
          workspaceMembers: [],
        };
        if (selected.role === 'owner') {
          state.vault.members = (await engine.members(scope)).map((member) => ({
            userId: uuid(member.user_id),
            displayName: null,
            role: role(member.role),
            revoked: member.revoked_at !== null,
          }));
          state.vault.workspaceMembers = await database.workspaceMembers(
            workspace.wsId
          );
        }
        return state;
      }),
    downloadCredentials: (input) =>
      run(input.kind === 'agent', async () => {
        database.principal(true);
        const workspace = await database.resolveWorkspace(input.wsId);
        const path =
          input.kind === 'agent' ? AGENT_CREDENTIALS_PATH : CREDENTIALS_PATH;
        const body = {
          workspaceId: workspace.wsId,
          vaultId: input.vaultId,
          ...(input.kind === 'agent'
            ? {
                grantRequestId: input.grantRequestId,
                tokenRequestId: input.tokenRequestId,
                itemIds: input.itemIds,
                scopes: input.scopes,
              }
            : {}),
        };
        const headers = new Headers(request.headers);
        headers.set('content-type', 'application/json');
        const response = await createSecretsHandler(env).handle(
          new Request(new URL(path, env.NEXT_PUBLIC_APP_URL), {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: request.signal,
          })
        );
        const uncertain = input.kind === 'agent';
        if (!response || (uncertain && response.status >= 500))
          throw new PasswordsError(
            uncertain ? 'OPERATION_UNCERTAIN' : 'UNAVAILABLE'
          );
        let data: PasswordsRecord;
        try {
          data = record(await response.json());
        } catch {
          throw new PasswordsError(
            uncertain ? 'OPERATION_UNCERTAIN' : 'UNAVAILABLE'
          );
        }
        if (!response.ok) {
          const code = PASSWORDS_ERROR_CODES.find(
            (code) => code.toLowerCase() === data.code
          );
          throw new PasswordsError(code ?? 'UNAVAILABLE');
        }
        return { base64: Buffer.from(JSON.stringify(data)).toString('base64') };
      }),
    createVault: (input) =>
      run(true, async (engine) => {
        const workspace = await database.resolveWorkspace(input.wsId);
        return engine.createVault({ ...input, wsId: workspace.wsId });
      }),
    putItem: (input) =>
      run(true, async (engine) => {
        const workspace = await database.resolveWorkspace(input.wsId);
        const bytes = decodeValue(input.base64, PASSWORDS_LIMITS.itemMaxBytes);
        try {
          return await engine.putItem(
            { ...input, wsId: workspace.wsId },
            bytes
          );
        } finally {
          bytes.fill(0);
        }
      }),
    revealItem: (input) =>
      run(true, async (engine) => {
        database.principal(true);
        const workspace = await database.resolveWorkspace(input.wsId);
        const bytes = await engine.revealItem({
          ...input,
          wsId: workspace.wsId,
        });
        try {
          database.principal(true);
          return {
            base64: bytes.toString('base64'),
            byteLength: bytes.byteLength,
          };
        } finally {
          bytes.fill(0);
        }
      }),
    setMember: (input) =>
      run(true, async (engine) => {
        database.principal(true);
        const workspace = await database.resolveWorkspace(input.wsId);
        return engine.setMember({ ...input, wsId: workspace.wsId });
      }),
    rotateVault: (input) =>
      run(true, async (engine) => {
        database.principal(true);
        const workspace = await database.resolveWorkspace(input.wsId);
        return engine.rotateVault({ ...input, wsId: workspace.wsId });
      }),
    audit: (input) =>
      run(false, async (engine) => {
        const workspace = await database.resolveWorkspace(input.wsId);
        return (await engine.audit({ ...input, wsId: workspace.wsId })).map(
          (event) => {
            const type = AUDIT_EVENT_TYPES.find(
              (type: AuditEventType) => type === event.event_type
            );
            if (!type) throw new PasswordsError('UNAVAILABLE');
            return {
              id: uuid(event.id),
              type,
              at: text(event.created_at),
              actorId: uuid(event.actor_user_id),
              actorName: null,
              resourceId: event.item_id == null ? null : uuid(event.item_id),
            };
          }
        );
      }),
  };
}
