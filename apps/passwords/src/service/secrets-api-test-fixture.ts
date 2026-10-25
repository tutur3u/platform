import { randomUUID } from 'node:crypto';
import {
  type PasswordsAction,
  PasswordsError,
  type PasswordsRecord,
} from '@tuturuuu/storage-core/vault/passwords-contract';
import { PasswordsVaultEngine } from '@tuturuuu/storage-core/vault/passwords-engine';
import { passwordsFixture } from '@tuturuuu/storage-core/vault/passwords-test-fixture';
import { createMachineRepository, type VaultRpc } from './machine-repository';
import { mintMachineToken } from './machine-token';
import {
  createSecretsOperation,
  type SecretsContext,
} from './secrets-operation';
import { OPERATION_PATH, SECRETS_ORIGIN } from './secrets-protocol';

export async function fixture(
  kind: 'human' | 'machine' = 'human',
  scopes = ['item.read', 'item.write']
) {
  const f = passwordsFixture();
  await f.initialize();
  const name = 'DEPLOY_KEY';
  await f.engine.putItem(
    { ...f.scope, name, requestId: randomUUID(), revision: 1 },
    Buffer.from('original synthetic value')
  );
  const itemId = [...f.items.keys()][0]!;
  const grantItems = new Set([itemId]);
  const token = mintMachineToken();
  let live = true;
  let contextCalls = 0;
  let current: SecretsContext;
  const rpcCalls: Parameters<VaultRpc>[0][] = [];
  const rpc: VaultRpc = async (args) => {
    rpcCalls.push(args);
    if (
      !live ||
      args.p_actor !== null ||
      args.p_token !== token.tokenId ||
      args.p_token_digest !== token.digest ||
      args.p_ws !== f.scope.wsId ||
      args.p_vault !== f.scope.vaultId
    )
      throw new PasswordsError('FORBIDDEN');
    if (args.p_action === 'item.list')
      return {
        replayed: false,
        vault: {
          ...f.vault,
          ws_id: f.scope.wsId,
          role: scopes.includes('item.write') ? 'editor' : 'viewer',
        },
        items: [...f.items.values()]
          .filter((item) => grantItems.has(String(item.id)))
          .map((item) => ({
            id: item.id,
            name: item.name,
            version: item.version,
            revision: item.revision,
          })),
      };
    if (args.p_action !== 'request.status') {
      if (
        !grantItems.has(String(args.p_input.item_id)) ||
        !scopes.includes(
          args.p_action === 'key.read' ? 'item.write' : args.p_action
        )
      )
        throw new PasswordsError('FORBIDDEN');
    }
    return f.deps.repository.execute(
      f.scope,
      args.p_request,
      args.p_action as PasswordsAction,
      args.p_input
    );
  };
  const handler = createSecretsOperation({
    enabled: f.deps.enabled,
    origin: SECRETS_ORIGIN,
    async context(_request, _scope, _token, requestId) {
      contextCalls++;
      if (kind === 'human')
        current = {
          kind,
          engine: f.engine,
          freshHuman: () => {
            if (!fresh) throw new PasswordsError('STEP_UP_REQUIRED');
          },
        };
      else {
        const machine = createMachineRepository(f.scope, requestId, token, {
          enabled: f.deps.enabled,
          rpc,
          storage: f.deps.storage,
        });
        current = {
          kind,
          freshHuman: () => {
            throw new PasswordsError('FORBIDDEN');
          },
          engine: new PasswordsVaultEngine({ ...f.deps, ...machine }),
        };
      }
      return current;
    },
  });
  let fresh = true;
  function request(
    action: string,
    extra: PasswordsRecord = {},
    id: string = randomUUID()
  ) {
    return new Request(`${SECRETS_ORIGIN}${OPERATION_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token.token}`,
      },
      body: JSON.stringify({
        workspaceId: f.scope.wsId,
        vaultId: f.scope.vaultId,
        requestId: id,
        action,
        ...extra,
      }),
    });
  }
  async function call(
    action: string,
    extra: PasswordsRecord = {},
    id?: string
  ) {
    const response = (await handler(request(action, extra, id)))!;
    return {
      status: response.status,
      body: await response.json(),
      headers: response.headers,
    };
  }
  return {
    ...f,
    token,
    name,
    itemId,
    grantItems,
    rpcCalls,
    rpc,
    handler,
    request,
    call,
    contextCalls: () => contextCalls,
    setLive(value: boolean) {
      live = value;
    },
    setHumanFresh(value: boolean) {
      fresh = value;
      f.setFresh(value);
    },
  };
}
