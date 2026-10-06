import { createHash } from 'node:crypto';
import { DESKTOP_SIGNING_PROFILES } from '../../packages/utils/src/desktop-signing-profiles.ts';

export const FILE_ENV = Object.freeze({
  windows_authenticode_certificate_pfx: 'WINDOWS_SIGNING_CERTIFICATE_PFX_B64',
  macos_developer_id_certificate_p12: 'MACOS_CERTIFICATE_P12_B64',
  macos_notarization_private_key_p8: 'APP_STORE_CONNECT_PRIVATE_KEY_P8_B64',
});
const fail = () => {
  throw new Error('Desktop signing bundle rejected');
};
function record(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
}
function exact(value, names) {
  record(value);
  if (
    Object.keys(value).length !== names.length ||
    Object.keys(value).some((key) => !names.includes(key))
  )
    fail();
}

/** Fail closed before exposing any values to the signing child. */
export function decodeSigningBundle(value, platform) {
  const buffers = [];
  try {
    const profile = DESKTOP_SIGNING_PROFILES[platform];
    if (!profile) fail();
    exact(value, [
      'schemaVersion',
      'platform',
      'versionId',
      'files',
      'scalars',
    ]);
    if (
      value.schemaVersion !== 1 ||
      value.platform !== platform ||
      typeof value.versionId !== 'string' ||
      !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu.test(
        value.versionId
      ) ||
      !Array.isArray(value.files) ||
      value.files.length !== profile.files.length
    )
      fail();
    exact(value.scalars, profile.scalars);
    const env = Object.create(null);
    const seen = new Set();
    for (const file of value.files) {
      exact(file, ['name', 'base64', 'sha256', 'size']);
      if (
        !profile.files.includes(file.name) ||
        seen.has(file.name) ||
        typeof file.base64 !== 'string' ||
        file.base64.length > 2796204 ||
        !Number.isSafeInteger(file.size) ||
        file.size < 1 ||
        file.size > 2097152 ||
        typeof file.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/u.test(file.sha256)
      )
        fail();
      seen.add(file.name);
      const bytes = Buffer.from(file.base64, 'base64');
      buffers.push(bytes);
      if (
        bytes.length !== file.size ||
        bytes.toString('base64') !== file.base64 ||
        createHash('sha256').update(bytes).digest('hex') !== file.sha256
      )
        fail();
      env[FILE_ENV[file.name]] = file.base64;
    }
    for (const name of profile.scalars) {
      const scalar = value.scalars[name];
      if (
        typeof scalar !== 'string' ||
        !scalar ||
        Buffer.byteLength(scalar) > 32768 ||
        Array.from(scalar).some((character) => {
          const code = character.codePointAt(0);
          return code < 32 || code === 127;
        })
      )
        fail();
      env[name] = scalar;
    }
    if (
      platform === 'macos' &&
      (!env.MACOS_SIGNING_IDENTITY.startsWith('Developer ID Application: ') ||
        !/^[A-Z0-9]{10}$/u.test(env.APPLE_TEAM_ID) ||
        !/^[A-Z0-9]{10}$/u.test(env.APP_STORE_CONNECT_API_KEY_ID) ||
        !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu.test(
          env.APP_STORE_CONNECT_ISSUER_ID
        ))
    )
      fail();
    return env;
  } catch {
    fail();
  } finally {
    for (const bytes of buffers) bytes.fill(0);
  }
}
