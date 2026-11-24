/**
 * KEK custody. Each version is a Worker secret named
 * `WORKSPACE_SECRETS_KEK_V<n>` holding 32 random bytes in base64 or
 * base64url; `WORKSPACE_SECRETS_KEK_ACTIVE_VERSION` names the version new
 * payloads use. Older versions stay bound until no payload uses them.
 */

export type KekEnv = Record<string, unknown>;

export class KekConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KekConfigError';
  }
}

const MAX_KEK_VERSION = 32_767;

function decodeKey(encoded: string): Uint8Array {
  const normalized = encoded.trim().replace(/-/gu, '+').replace(/_/gu, '/');
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(normalized)) {
    throw new KekConfigError('kek_malformed');
  }
  const binary = atob(
    normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  );
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  if (bytes.length !== 32) throw new KekConfigError('kek_wrong_length');
  return bytes;
}

export function activeKekVersion(env: KekEnv): number {
  const raw = env.WORKSPACE_SECRETS_KEK_ACTIVE_VERSION;
  const version =
    typeof raw === 'string' && /^[1-9][0-9]*$/u.test(raw.trim())
      ? Number(raw.trim())
      : Number.NaN;
  if (!Number.isSafeInteger(version) || version > MAX_KEK_VERSION) {
    throw new KekConfigError('kek_active_version_invalid');
  }
  return version;
}

/** The KEK for one version, or a config error that names no key material. */
export function loadKek(env: KekEnv, version: number): Uint8Array {
  if (
    !Number.isSafeInteger(version) ||
    version < 1 ||
    version > MAX_KEK_VERSION
  ) {
    throw new KekConfigError('kek_version_invalid');
  }
  const raw = env[`WORKSPACE_SECRETS_KEK_V${version}`];
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new KekConfigError('kek_missing');
  }
  return decodeKey(raw);
}
