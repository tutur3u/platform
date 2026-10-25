import { createPasswordsAuthEdge } from './auth-edge';
import type { PasswordsEnvironment } from './environment';
import type { PasswordsRuntime } from './port';
import { createSecretsHandler } from './secrets-adapter.server';
import { isPasswordsEnabled } from './stop-fence';
import { createPasswordsService } from './vault-service.server';

export function createPasswordsRuntime(
  env: PasswordsEnvironment
): PasswordsRuntime {
  return {
    secrets: createSecretsHandler(env),
    edge: {
      handle: (request) =>
        isPasswordsEnabled(env)
          ? createPasswordsAuthEdge(env).handle(request)
          : Promise.resolve(
              Response.json({ code: 'STOPPED' }, { status: 503 })
            ),
    },
    service: (request) => createPasswordsService(request, env),
  };
}
