import { homedir } from 'node:os';
import { join } from 'node:path';
import { readCredentialsFile, wipe } from './secrets-files';

export const SECRETS_ENDPOINT = 'https://passwords.tuturuuu.com';
export const SECRETS_OPERATION_PATH = '/api/v1/secrets/operation';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Header-safe bearer alphabet; also rules out CR/LF injection.
const TOKEN = /^[A-Za-z0-9._~+/=-]{16,2048}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const KEYS = [
  'version',
  'endpoint',
  'workspaceId',
  'vaultId',
  'token',
  'expiresAt',
];

export type SecretsCredentialsFailure = 'malformed' | 'endpoint' | 'expired';

const MESSAGES: Record<SecretsCredentialsFailure, string> = {
  malformed: 'Credentials file is not a valid version 1 secrets credential',
  endpoint: 'Credentials endpoint is not the permitted Passwords endpoint',
  expired:
    'Credentials have expired; export a new credentials file from the Passwords app',
};

export class SecretsCredentialsError extends Error {
  constructor(readonly reason: SecretsCredentialsFailure) {
    super(MESSAGES[reason]);
    this.name = 'SecretsCredentialsError';
  }
}

export interface SecretsCredentials {
  version: 1;
  endpoint: string;
  workspaceId: string;
  vaultId: string;
  token: string;
  expiresAt: string;
}

export interface LoadCredentialsOptions {
  now?: () => number;
  /** Exact endpoint strings. Production only unless a test injects another. */
  allowedEndpoints?: readonly string[];
}

export function defaultCredentialsFile() {
  return join(homedir(), '.tuturuuu', 'secrets.json');
}

export function parseCredentials(
  text: string,
  options: LoadCredentialsOptions = {}
): SecretsCredentials {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new SecretsCredentialsError('malformed');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new SecretsCredentialsError('malformed');
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== KEYS.length || !KEYS.every((key) => key in record))
    throw new SecretsCredentialsError('malformed');
  const { version, endpoint, workspaceId, vaultId, token, expiresAt } = record;
  if (
    version !== 1 ||
    typeof endpoint !== 'string' ||
    typeof workspaceId !== 'string' ||
    !UUID.test(workspaceId) ||
    typeof vaultId !== 'string' ||
    !UUID.test(vaultId) ||
    typeof token !== 'string' ||
    !TOKEN.test(token) ||
    typeof expiresAt !== 'string' ||
    !ISO_TIMESTAMP.test(expiresAt) ||
    Number.isNaN(Date.parse(expiresAt))
  )
    throw new SecretsCredentialsError('malformed');
  if (!(options.allowedEndpoints ?? [SECRETS_ENDPOINT]).includes(endpoint))
    throw new SecretsCredentialsError('endpoint');
  if (Date.parse(expiresAt) <= (options.now ?? Date.now)())
    throw new SecretsCredentialsError('expired');
  return { version, endpoint, workspaceId, vaultId, token, expiresAt };
}

export async function loadCredentials(
  path: string,
  options: LoadCredentialsOptions = {}
) {
  const bytes = await readCredentialsFile(path);
  try {
    return parseCredentials(bytes.toString('utf8'), options);
  } finally {
    wipe(bytes);
  }
}
