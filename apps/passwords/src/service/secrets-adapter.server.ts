import { createAppSessionToken } from '@tuturuuu/auth/app-session-core';
import {
  PasswordsError,
  requireEnabled,
} from '@tuturuuu/storage-core/vault/passwords-contract';
import { PasswordsVaultEngine } from '@tuturuuu/storage-core/vault/passwords-engine';
import { workspaceKeyWrapper } from '@tuturuuu/storage-core/vault/workspace-key-wrapper';
import { cliScope, cliScopeName } from './cli-scope';
import { createPasswordsDatabase } from './database.server';
import type { PasswordsEnvironment } from './environment';
import { createMachineRepository } from './machine-repository';
import { parseMachineToken } from './machine-token';
import { createSecretsIssuance } from './secrets-issuance';
import { createSecretsOperation } from './secrets-operation';
import { issueOwnerMachineCredential } from './secrets-owner-issuance';
import { exactKeys, failure, SECRETS_ORIGIN } from './secrets-protocol';
import { createSecretsTransport } from './secrets-transport.server';
import { evaluateStepUp } from './step-up';
import { isPasswordsEnabled } from './stop-fence';

export function createSecretsHandler(
  env: PasswordsEnvironment & { PASSWORDS_GITHUB_POLICIES?: string }
) {
  const enabled = () => isPasswordsEnabled(env);
  const origin = SECRETS_ORIGIN;
  const keyWrapper = {
    wrap: (key: Buffer) => {
      requireEnabled(enabled);
      return workspaceKeyWrapper(env.ENCRYPTION_MASTER_KEY).wrap(key);
    },
    unwrap: (key: string) => {
      requireEnabled(enabled);
      return workspaceKeyWrapper(env.ENCRYPTION_MASTER_KEY).unwrap(key);
    },
  };
  const operation = createSecretsOperation({
    enabled,
    origin,
    async context(request, scope, token, requestId) {
      requireEnabled(enabled);
      if (token.startsWith('pwm1.')) {
        const proof = parseMachineToken(token);
        const transport = createSecretsTransport(env, request, enabled);
        const machine = createMachineRepository(scope, requestId, proof, {
          ...transport,
          enabled,
        });
        const engine = new PasswordsVaultEngine({
          ...machine,
          keyWrapper,
          enabled,
          authorize: async (wsId) => {
            requireEnabled(enabled);
            if (wsId !== scope.wsId) throw new PasswordsError('FORBIDDEN');
          },
        });
        return {
          engine,
          kind: 'machine',
          freshHuman: () => {
            throw new PasswordsError('FORBIDDEN');
          },
        };
      }
      // Header-only construction prevents an invalid machine bearer falling back to browser cookies.
      const headers = new Headers(request.headers);
      headers.delete('cookie');
      const humanRequest = new Request(request.url, {
        method: 'POST',
        headers,
        signal: request.signal,
      });
      const database = createPasswordsDatabase(env, humanRequest);
      const scoped = cliScope(database.principal());
      if (
        !scoped ||
        scoped.wsId !== scope.wsId ||
        scoped.vaultId !== scope.vaultId
      )
        throw new PasswordsError('FORBIDDEN');
      const engine = new PasswordsVaultEngine({
        repository: database.repository,
        storage: database.storage,
        enabled,
        keyWrapper,
        authorize: async (_wsId, fresh) => {
          database.principal(fresh);
        },
      });
      return {
        engine,
        kind: 'human',
        freshHuman: () => {
          database.principal(true);
        },
      };
    },
  });
  const issuance = createSecretsIssuance({
    enabled,
    origin,
    policies: env.PASSWORDS_GITHUB_POLICIES,
    fetch,
    now: Date.now,
    rpc: (request) => createSecretsTransport(env, request, enabled).rpc,
    vault: (request, scope, actor) =>
      createSecretsTransport(env, request, enabled).vault(scope, actor),
    async agent(request, input) {
      exactKeys(input, [
        'workspaceId',
        'vaultId',
        'grantRequestId',
        'tokenRequestId',
        'itemIds',
        'scopes',
      ]);
      const database = createPasswordsDatabase(env, request);
      const owner = async (scope: { wsId: string; vaultId: string }) => {
        const claims = database.principal(true);
        const engine = new PasswordsVaultEngine({
          repository: database.repository,
          storage: database.storage,
          enabled,
          keyWrapper,
          authorize: async (_wsId, fresh) => {
            database.principal(fresh);
          },
        });
        return { actor: claims.sub, vault: await engine.vault(scope, 'owner') };
      };
      // Parse all caller-controlled fields before any privileged write.
      const { ownerCredentialInput } = await import('./schemas');
      const parsed = ownerCredentialInput.safeParse({
        ...input,
        kind: 'agent',
        wsId: input.workspaceId,
      });
      if (!parsed.success || parsed.data.kind !== 'agent')
        throw new PasswordsError('INVALID_INPUT');
      return issueOwnerMachineCredential(
        {
          ...parsed.data,
          grantExpiresAt: Date.now() + 24 * 60 * 60 * 1000 - 1000,
        },
        {
          request,
          origin,
          enabled,
          now: Date.now,
          rpc: createSecretsTransport(env, request, enabled).rpc,
          owner,
        }
      );
    },
    async human(request, scope) {
      const database = createPasswordsDatabase(env, request);
      const claims = database.principal(true);
      const engine = new PasswordsVaultEngine({
        repository: database.repository,
        storage: database.storage,
        enabled,
        keyWrapper,
        authorize: async (_wsId, fresh) => {
          database.principal(fresh);
        },
      });
      await engine.vault(scope, 'owner');
      const proof = evaluateStepUp(database.principal(true).mfa);
      if (!proof.fresh) throw new PasswordsError('STEP_UP_REQUIRED');
      const ttl = Math.floor(
        Math.min(claims.exp, proof.expiresAtSeconds) - Date.now() / 1000
      );
      if (ttl <= 0) throw new PasswordsError('STEP_UP_REQUIRED');
      const issued = createAppSessionToken(
        {
          userId: claims.sub,
          targetApp: 'passwords',
          originApp: 'passwords',
          scopes: [cliScopeName(scope.wsId, scope.vaultId)],
          mfa: claims.mfa,
          expiresInSeconds: Math.min(900, ttl),
        },
        { secret: env.TUTURUUU_APP_COORDINATION_SECRET }
      );
      return { token: issued.token, expiresAt: Date.parse(issued.expiresAt) };
    },
  });
  return {
    async handle(request: Request) {
      try {
        return (await operation(request)) ?? (await issuance(request));
      } catch (error) {
        return failure(error);
      }
    },
  };
}
