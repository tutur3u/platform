import type { PasswordsEnvironment } from './environment';
import type { PasswordsServicePort } from './port';

/**
 * The stop fence reads the Worker binding on every call and holds no state.
 * Missing, empty or any value other than the exact string `true` is disabled.
 */
export function isPasswordsEnabled(
  env: Pick<PasswordsEnvironment, 'PASSWORDS_ENABLED'>
) {
  return env.PASSWORDS_ENABLED === 'true';
}

const stopped = async () => ({ ok: false, code: 'STOPPED' }) as const;

/**
 * Wraps the real service so no operation reaches it while the fence is closed.
 * Defense in depth: the Worker already refuses before building the runtime.
 */
export function fenceService(
  port: PasswordsServicePort,
  enabled: () => boolean
): PasswordsServicePort {
  return {
    observeOperation: (input) =>
      enabled() ? port.observeOperation(input) : stopped(),
    state: (input) => (enabled() ? port.state(input) : stopped()),
    createVault: (input) => (enabled() ? port.createVault(input) : stopped()),
    putItem: (input) => (enabled() ? port.putItem(input) : stopped()),
    revealItem: (input) => (enabled() ? port.revealItem(input) : stopped()),
    setMember: (input) => (enabled() ? port.setMember(input) : stopped()),
    rotateVault: (input) => (enabled() ? port.rotateVault(input) : stopped()),
    audit: (input) => (enabled() ? port.audit(input) : stopped()),
  };
}
