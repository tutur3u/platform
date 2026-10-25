import {
  PasswordsError,
  uuid,
} from '@tuturuuu/storage-core/vault/passwords-contract';

const prefix = 'passwords:cli:';
export function cliScope(claims: {
  scopes: string[];
  iat: number;
  exp: number;
}) {
  const scopes = claims.scopes.filter((scope) => scope.startsWith(prefix));
  if (!scopes.length) return null;
  if (scopes.length !== 1 || claims.exp - claims.iat > 900)
    throw new PasswordsError('UNAUTHENTICATED');
  const parts = scopes[0]!.slice(prefix.length).split(':');
  if (parts.length !== 2) throw new PasswordsError('UNAUTHENTICATED');
  return { wsId: uuid(parts[0]), vaultId: uuid(parts[1]) };
}
export function cliScopeName(wsId: string, vaultId: string) {
  return `${prefix}${uuid(wsId)}:${uuid(vaultId)}`;
}
