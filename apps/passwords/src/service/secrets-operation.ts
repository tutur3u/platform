import {
  decodeValue,
  integer,
  label,
  PASSWORDS_MAX_ITEMS,
  PasswordsError,
  requireEnabled,
  text,
  uuid,
} from '@tuturuuu/storage-core/vault/passwords-contract';
import type { PasswordsVaultEngine } from '@tuturuuu/storage-core/vault/passwords-engine';
import {
  bearer,
  boundedJson,
  exactKeys,
  failure,
  json,
  MAX_BODY,
  MAX_REQUEST_MS,
  OPERATION_PATH,
  post,
  type Scope,
} from './secrets-protocol';

export interface SecretsContext {
  kind: 'human' | 'machine';
  engine: Pick<
    PasswordsVaultEngine,
    | 'vault'
    | 'items'
    | 'putItem'
    | 'revealItem'
    | 'rotateVault'
    | 'observeOperation'
  >;
  freshHuman(): void;
}
export interface SecretsOperationDependencies {
  enabled(): boolean;
  origin: string;
  context(
    request: Request,
    scope: Scope,
    token: string,
    requestId: string
  ): Promise<SecretsContext>;
}

const fields: Record<string, string[]> = {
  list: [],
  get: ['name'],
  put: ['name', 'bytesBase64'],
  rotate: [],
  'request.status': ['targetRequestId'],
};

export function createSecretsOperation(deps: SecretsOperationDependencies) {
  return async (original: Request): Promise<Response | null> => {
    if (new URL(original.url).pathname !== OPERATION_PATH) return null;
    let dispatched = false;
    let bytes: Buffer | undefined;
    try {
      requireEnabled(deps.enabled);
      post(original, deps.origin);
      const token = bearer(original);
      const signal = AbortSignal.any([
        original.signal,
        AbortSignal.timeout(MAX_REQUEST_MS),
      ]);
      const request = new Request(original, { signal });
      const input = await boundedJson(request.body, MAX_BODY, signal);
      requireEnabled(deps.enabled);
      const action = text(input.action, 32);
      if (!Object.hasOwn(fields, action))
        throw new PasswordsError('INVALID_INPUT');
      exactKeys(input, [
        'workspaceId',
        'vaultId',
        'requestId',
        'action',
        ...fields[action]!,
      ]);
      const scope = {
        wsId: uuid(input.workspaceId),
        vaultId: uuid(input.vaultId),
      };
      const requestId = uuid(input.requestId);
      if (action === 'get' || action === 'put') label(input.name);
      if (action === 'put') {
        bytes = decodeValue(text(input.bytesBase64, MAX_BODY));
        if (!bytes.length) throw new PasswordsError('INVALID_INPUT');
      }
      if (action === 'request.status') uuid(input.targetRequestId);
      const context = await deps.context(request, scope, token, requestId);
      const engine = context.engine;
      let value: unknown;
      if (action === 'request.status') {
        const observed = await engine.observeOperation({
          ...scope,
          targetRequestId: uuid(input.targetRequestId),
        });
        if (!observed.found) value = { found: false };
        else if (
          observed.action === 'item.write' ||
          observed.action === 'vault.rotate'
        )
          value = {
            found: true,
            action: observed.action === 'item.write' ? 'put' : 'rotate',
            receipt: observed.receipt,
          };
        else throw new PasswordsError('FORBIDDEN');
      } else {
        if (action === 'rotate') {
          if (context.kind !== 'human') throw new PasswordsError('FORBIDDEN');
          context.freshHuman();
        }
        const vault = await engine.vault(
          scope,
          action === 'rotate' ? 'owner' : action === 'put' ? 'write' : 'read'
        );
        const revision = integer(vault.revision, 1);
        if (action === 'rotate') {
          dispatched = true;
          value = {
            ...(await engine.rotateVault({ ...scope, requestId, revision })),
            requestId,
          };
        } else if (action === 'put') {
          dispatched = true;
          value = {
            ...(await engine.putItem(
              { ...scope, requestId, revision, name: label(input.name) },
              bytes!
            )),
            requestId,
          };
        } else {
          const items = await engine.items(scope);
          if (items.length > PASSWORDS_MAX_ITEMS)
            throw new PasswordsError('TOO_LARGE');
          if (action === 'list')
            value = {
              items: items.map((item) => ({
                id: uuid(item.id),
                name: label(item.name),
              })),
              revision,
            };
          else {
            const name = label(input.name);
            const item = items.find(
              (item) => text(item.name).toLowerCase() === name.toLowerCase()
            );
            if (!item) throw new PasswordsError('NOT_FOUND');
            bytes = await engine.revealItem({
              ...scope,
              requestId,
              itemId: uuid(item.id),
            });
            value = { name, bytesBase64: bytes.toString('base64') };
          }
        }
      }
      requireEnabled(deps.enabled);
      if (signal.aborted) throw new PasswordsError('UNAVAILABLE');
      return json({ ok: true, value });
    } catch (error) {
      // Once the engine begins a write, a later refusal cannot settle an earlier storage/CAS outcome.
      return failure(error, dispatched);
    } finally {
      bytes?.fill(0);
    }
  };
}
