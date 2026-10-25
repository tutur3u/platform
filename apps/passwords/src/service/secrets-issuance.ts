import {
  integer,
  PasswordsError,
  type PasswordsRecord,
  requireEnabled,
  uuid,
} from '@tuturuuu/storage-core/vault/passwords-contract';
import type { VaultRpc } from './machine-repository';
import { MACHINE_TTL_MS, mintMachineToken } from './machine-token';
import { parsePolicies, verifyGitHubPolicy } from './secrets-oidc';
import {
  AGENT_CREDENTIALS_PATH,
  bearer,
  boundedJson,
  CREDENTIALS_PATH,
  credentials,
  EXCHANGE_PATH,
  exactKeys,
  failure,
  json,
  MAX_REQUEST_MS,
  post,
  type Scope,
} from './secrets-protocol';

export interface IssuanceDependencies {
  agent?(request: Request, input: PasswordsRecord): Promise<unknown>;
  enabled(): boolean;
  origin: string;
  policies?: string;
  fetch: typeof fetch;
  now(): number;
  rpc(request: Request): VaultRpc;
  vault(
    request: Request,
    scope: Scope,
    actor: string
  ): Promise<PasswordsRecord>;
  human(
    request: Request,
    scope: Scope
  ): Promise<{ token: string; expiresAt: number }>;
}

export function createSecretsIssuance(deps: IssuanceDependencies) {
  return async (original: Request): Promise<Response | null> => {
    const path = new URL(original.url).pathname;
    if (
      path !== EXCHANGE_PATH &&
      path !== CREDENTIALS_PATH &&
      path !== AGENT_CREDENTIALS_PATH
    )
      return null;
    let dispatched = false;
    try {
      requireEnabled(deps.enabled);
      post(original, deps.origin, path !== EXCHANGE_PATH);
      const signal = AbortSignal.any([
        original.signal,
        AbortSignal.timeout(MAX_REQUEST_MS),
      ]);
      const request = new Request(original, { signal });
      const input = await boundedJson(request.body, 4096, signal);
      requireEnabled(deps.enabled);
      if (path === AGENT_CREDENTIALS_PATH) {
        if (!deps.agent) throw new PasswordsError('UNAVAILABLE');
        return json(await deps.agent(request, input), 200, true);
      }
      if (path === CREDENTIALS_PATH) {
        exactKeys(input, ['workspaceId', 'vaultId']);
        const scope = {
          wsId: uuid(input.workspaceId),
          vaultId: uuid(input.vaultId),
        };
        const human = await deps.human(request, scope);
        requireEnabled(deps.enabled);
        if (signal.aborted) throw new PasswordsError('UNAVAILABLE');
        return json(
          credentials(scope, human.token, human.expiresAt),
          200,
          true
        );
      }
      exactKeys(input, ['requestId']);
      const requestId = uuid(input.requestId);
      const policy = await verifyGitHubPolicy(
        bearer(request),
        parsePolicies(deps.policies),
        {
          enabled: deps.enabled,
          fetch: deps.fetch,
          now: deps.now,
          signal,
        }
      );
      const scope = { wsId: policy.wsId, vaultId: policy.vaultId };
      const vault = await deps.vault(request, scope, policy.issuerUserId);
      if (vault.role !== 'owner') throw new PasswordsError('FORBIDDEN');
      const minted = mintMachineToken();
      const expiresAt = deps.now() + MACHINE_TTL_MS - 1000;
      requireEnabled(deps.enabled);
      dispatched = true;
      const result = await deps.rpc(request)({
        p_ws: scope.wsId,
        p_vault: scope.vaultId,
        p_actor: policy.issuerUserId,
        p_request: requestId,
        p_action: 'token.issue',
        p_input: {
          expected_revision: String(integer(vault.revision, 1)),
          grant_id: policy.grantId,
          token_id: minted.tokenId,
          token_digest: minted.digest,
          expires_at: new Date(expiresAt).toISOString(),
        },
      });
      if (result.replayed !== false)
        throw new PasswordsError('OPERATION_UNCERTAIN');
      requireEnabled(deps.enabled);
      if (signal.aborted) throw new PasswordsError('UNAVAILABLE');
      return json(credentials(scope, minted.token, expiresAt), 200, true);
    } catch (error) {
      return failure(error, dispatched);
    }
  };
}
