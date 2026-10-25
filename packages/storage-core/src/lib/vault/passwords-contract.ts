export const PASSWORDS_BUCKET = 'password-vault-files';
export const PASSWORDS_MAX_ITEMS = 16;
export const PASSWORDS_MAX_BYTES = 5 * 1024 * 1024;
export const PASSWORDS_MAX_CIPHERTEXT = 7 * 1024 * 1024;

export type PasswordsErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'STEP_UP_REQUIRED'
  | 'REVISION_CONFLICT'
  | 'INVALID_INPUT'
  | 'TOO_LARGE'
  | 'RATE_LIMITED'
  | 'STOPPED'
  | 'UNAVAILABLE'
  | 'OPERATION_UNCERTAIN';

export class PasswordsError extends Error {
  constructor(public readonly code: PasswordsErrorCode) {
    super(code);
    this.name = 'PasswordsError';
  }
}

export type PasswordsRole = 'owner' | 'editor' | 'viewer';
export type PasswordsRecord = Record<string, unknown>;
export type PasswordsScope = { wsId: string; vaultId: string };
export type PasswordsAction =
  | 'vault.create'
  | 'item.list'
  | 'member.list'
  | 'audit.list'
  | 'request.status'
  | 'key.read'
  | 'item.read'
  | 'item.write'
  | 'member.set'
  | 'rotation.snapshot'
  | 'vault.rotate';

export interface PasswordsRepository {
  list(wsId: string): Promise<PasswordsRecord>;
  execute(
    scope: PasswordsScope,
    requestId: string,
    action: PasswordsAction,
    input: PasswordsRecord
  ): Promise<PasswordsRecord>;
}

export interface PasswordsStorage {
  upload(path: string, ciphertext: Uint8Array): Promise<{ id: string }>;
  download(path: string): Promise<Uint8Array>;
}

export function requireEnabled(enabled: () => boolean) {
  if (!enabled()) throw new PasswordsError('STOPPED');
}

export function uuid(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      value
    )
  ) {
    throw new PasswordsError('INVALID_INPUT');
  }
  return value;
}

export function integer(
  value: unknown,
  min = 0,
  max = Number.MAX_SAFE_INTEGER
): number {
  const n =
    typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)
      ? Number(value)
      : value;
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < min || n > max) {
    throw new PasswordsError('INVALID_INPUT');
  }
  return n;
}

export function record(value: unknown): PasswordsRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new PasswordsError('UNAVAILABLE');
  return value as PasswordsRecord;
}

export function rows(value: unknown, max: number): PasswordsRecord[] {
  if (!Array.isArray(value)) throw new PasswordsError('UNAVAILABLE');
  if (value.length > max) throw new PasswordsError('TOO_LARGE');
  return value.map(record);
}

export function text(value: unknown, max = 4096): string {
  if (typeof value !== 'string' || value.length > max)
    throw new PasswordsError('UNAVAILABLE');
  return value;
}

export function label(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value !== value.trim() ||
    [...value].length > 120 ||
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || (code >= 127 && code <= 159);
    })
  ) {
    throw new PasswordsError('INVALID_INPUT');
  }
  return value;
}

export function role(value: unknown): PasswordsRole {
  if (value !== 'owner' && value !== 'editor' && value !== 'viewer')
    throw new PasswordsError('FORBIDDEN');
  return value;
}

export function scopeIds(scope: PasswordsScope) {
  uuid(scope.wsId);
  uuid(scope.vaultId);
}

export function decodeValue(
  value: string,
  maxBytes = PASSWORDS_MAX_BYTES
): Buffer {
  if (typeof value !== 'string' || value.length > Math.ceil(maxBytes / 3) * 4)
    throw new PasswordsError('TOO_LARGE');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value || bytes.length > maxBytes) {
    bytes.fill(0);
    throw new PasswordsError('INVALID_INPUT');
  }
  return bytes;
}
