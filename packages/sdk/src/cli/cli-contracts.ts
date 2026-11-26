import type { CliEnv } from './cli-env';

export const CLI_EXIT = {
  auth: 3,
  conflict: 2,
  notFound: 4,
  ok: 0,
  policy: 6,
  unavailable: 5,
  usage: 1,
} as const;

export type CliExitCode = (typeof CLI_EXIT)[keyof typeof CLI_EXIT];

export interface CliErrorOptions {
  cause?: unknown;
  code: string;
  docsUrl?: string;
  exitCode?: CliExitCode;
  hint?: string;
  message: string;
  requestId?: string;
}

export class CliError extends Error {
  readonly code: string;
  readonly docsUrl?: string;
  readonly exitCode: CliExitCode;
  readonly hint?: string;
  readonly requestId?: string;

  constructor(options: CliErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = 'CliError';
    this.code = options.code;
    this.exitCode = options.exitCode ?? CLI_EXIT.usage;
    this.hint = options.hint;
    this.docsUrl = options.docsUrl;
    this.requestId = options.requestId;
  }
}

export const CREDENTIAL_FAMILIES = [
  'tuturuuu',
  'upskii-qa',
  'upskii-user',
  'upskii-admin',
  'infra',
  'db',
] as const;

export type CredentialFamily = (typeof CREDENTIAL_FAMILIES)[number];

export type CredentialStoreBackend =
  | 'dpapi'
  | 'env'
  | 'file'
  | 'keychain'
  | 'secret-tool';

export interface CredentialMetadata {
  backend: CredentialStoreBackend;
  env: CliEnv;
  expiresAt?: string | null;
  family: CredentialFamily;
  origin?: string;
  profile: string;
  scopes: string[];
  updatedAt: string;
}

export interface CredentialRecord extends CredentialMetadata {
  secret: string;
}

export interface MutationDiffEntry {
  after?: unknown;
  before?: unknown;
  field: string;
}

export interface MutationPreview {
  applyHint: string;
  changes: MutationDiffEntry[];
  confirmToken?: string;
  env: CliEnv;
  origin: string;
  target: string;
  tier: 1 | 2;
  title: string;
}

export interface CliTraceHeaders {
  'X-TTR-CLI-Version': string;
  'X-TTR-Command': string;
  'X-TTR-Env': CliEnv;
  'X-TTR-Reason'?: string;
  'X-TTR-Request-Id': string;
}

export interface WatchTickContext {
  attempt: number;
  observedAt: string;
  signal: AbortSignal;
}

export interface TableColumnSpec {
  align?: 'left' | 'right';
  key: string;
  label?: string;
  minWidth?: number;
}
