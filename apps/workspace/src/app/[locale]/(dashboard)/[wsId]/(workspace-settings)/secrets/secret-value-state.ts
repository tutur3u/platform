import type { WorkspaceSecret } from '@tuturuuu/types/primitives/WorkspaceSecret';

/** Whether a value is stored, including values the server withheld. */
export function isSecretValueSet(secret?: WorkspaceSecret | null) {
  if (!secret) return false;
  return secret.value_set ?? Boolean(secret.value);
}

/** Whether the server withheld this secret's value. */
export function isSecretValueMasked(secret?: WorkspaceSecret | null) {
  return secret?.value_masked === true;
}
