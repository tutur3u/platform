import {
  BLOCKED_ENV_FILE_KEYS,
  EXPECTED_ANDROID_PACKAGE_NAME,
  EXPECTED_IOS_BUNDLE_ID,
  MAX_ENV_VALUE_BYTES,
  MAX_MOBILE_DEPLOYMENT_FILE_BYTES,
  MAX_SCALAR_VALUE_BYTES,
  MOBILE_DEPLOYMENT_FILE_KINDS,
  MOBILE_DEPLOYMENT_GOOGLE_PLAY_TRACKS,
  MOBILE_DEPLOYMENT_SCALAR_NAMES,
  type MobileDeploymentFileKind,
  type MobileDeploymentScalarName,
} from './constants';

const ENV_KEY_PATTERN = /^[A-Z][A-Z0-9_]{0,79}$/u;

export class MobileDeploymentValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: string[] = [message]
  ) {
    super(message);
    this.name = 'MobileDeploymentValidationError';
  }
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function hasDisallowedControlCharacter(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (
      (code >= 0 && code <= 8) ||
      code === 11 ||
      code === 12 ||
      (code >= 14 && code <= 31) ||
      code === 127
    ) {
      return true;
    }
  }

  return false;
}

function assertSingleLineUtf8Value(value: string, maxBytes: number) {
  if (value.includes('\n') || value.includes('\r')) {
    throw new MobileDeploymentValidationError(
      'Secret values must be single-line UTF-8 strings'
    );
  }

  if (hasDisallowedControlCharacter(value)) {
    throw new MobileDeploymentValidationError(
      'Secret values must not contain control characters'
    );
  }

  if (byteLength(value) > maxBytes) {
    throw new MobileDeploymentValidationError(
      `Secret value exceeds ${maxBytes} bytes`
    );
  }
}

export function assertMobileDeploymentFileKind(
  value: string
): MobileDeploymentFileKind {
  if (
    !MOBILE_DEPLOYMENT_FILE_KINDS.includes(value as MobileDeploymentFileKind)
  ) {
    throw new MobileDeploymentValidationError('Unsupported file resource');
  }

  return value as MobileDeploymentFileKind;
}

export function assertMobileDeploymentScalarName(
  value: string
): MobileDeploymentScalarName {
  if (
    !MOBILE_DEPLOYMENT_SCALAR_NAMES.includes(
      value as MobileDeploymentScalarName
    )
  ) {
    throw new MobileDeploymentValidationError('Unsupported scalar resource');
  }

  return value as MobileDeploymentScalarName;
}

export function assertMobileDeploymentEnvKey(value: string) {
  const key = value.trim();

  if (!ENV_KEY_PATTERN.test(key)) {
    throw new MobileDeploymentValidationError(
      `${key || '(empty)'} is not an allowed env key name`
    );
  }

  if ((BLOCKED_ENV_FILE_KEYS as readonly string[]).includes(key)) {
    throw new MobileDeploymentValidationError(
      `${key} must be uploaded as a file or scalar resource`
    );
  }

  if ((MOBILE_DEPLOYMENT_SCALAR_NAMES as readonly string[]).includes(key)) {
    throw new MobileDeploymentValidationError(
      `${key} is a built-in secret; edit the existing row instead`
    );
  }

  return key;
}

export function normalizeEnvEntry(rawKey: string, rawValue: string) {
  const key = assertMobileDeploymentEnvKey(rawKey);
  const value = String(rawValue);

  try {
    assertSingleLineUtf8Value(value, MAX_ENV_VALUE_BYTES);
  } catch (error) {
    throw new MobileDeploymentValidationError(
      'Invalid mobile deployment env value',
      [
        `${key}: ${error instanceof Error ? error.message : 'invalid env value'}`,
      ]
    );
  }

  return { key, value };
}

export function normalizeEnvEntries(entries: Record<string, string>) {
  const normalized: Record<string, string> = {};
  const errors: string[] = [];

  for (const [rawKey, rawValue] of Object.entries(entries)) {
    try {
      const { key, value } = normalizeEnvEntry(rawKey, rawValue);
      normalized[key] = value;
    } catch (error) {
      if (error instanceof MobileDeploymentValidationError) {
        errors.push(...error.errors);
      } else {
        errors.push('invalid env value');
      }
    }
  }

  if (errors.length) {
    throw new MobileDeploymentValidationError(
      'Invalid mobile deployment env values',
      errors
    );
  }

  return normalized;
}

export function parseEnvFile(contents: string) {
  const entries: Record<string, string> = {};
  const errors: string[] = [];

  for (const [index, rawLine] of contents.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separator = line.indexOf('=');
    if (separator <= 0) {
      errors.push(`Line ${index + 1} is not KEY=value`);
      continue;
    }

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1);
    entries[key] = value;
  }

  if (errors.length) {
    throw new MobileDeploymentValidationError(
      'Invalid mobile deployment env file',
      errors
    );
  }

  return normalizeEnvEntries(entries);
}

export function validateScalarValue(
  name: MobileDeploymentScalarName,
  value: string
) {
  assertSingleLineUtf8Value(value, MAX_SCALAR_VALUE_BYTES);

  if (
    name === 'GOOGLE_PLAY_PACKAGE_NAME' &&
    value !== EXPECTED_ANDROID_PACKAGE_NAME
  ) {
    throw new MobileDeploymentValidationError(
      `GOOGLE_PLAY_PACKAGE_NAME must be ${EXPECTED_ANDROID_PACKAGE_NAME}`
    );
  }

  if (
    name === 'GOOGLE_PLAY_TRACK' &&
    !(MOBILE_DEPLOYMENT_GOOGLE_PLAY_TRACKS as readonly string[]).includes(value)
  ) {
    throw new MobileDeploymentValidationError(
      `GOOGLE_PLAY_TRACK must be one of ${MOBILE_DEPLOYMENT_GOOGLE_PLAY_TRACKS.join(', ')}`
    );
  }

  if (name === 'APPLE_BUNDLE_ID' && value !== EXPECTED_IOS_BUNDLE_ID) {
    throw new MobileDeploymentValidationError(
      `APPLE_BUNDLE_ID must be ${EXPECTED_IOS_BUNDLE_ID}`
    );
  }

  if (
    name === 'APP_STORE_CONNECT_API_KEY_ID' &&
    !/^[A-Z0-9]{8,12}$/u.test(value)
  ) {
    throw new MobileDeploymentValidationError(
      'APP_STORE_CONNECT_API_KEY_ID must look like an App Store Connect key id'
    );
  }

  return value;
}

function parseJson(buffer: Uint8Array) {
  try {
    return JSON.parse(new TextDecoder().decode(buffer)) as unknown;
  } catch {
    throw new MobileDeploymentValidationError('File must be valid JSON');
  }
}

function assertObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MobileDeploymentValidationError('File JSON must be an object');
  }

  return value as Record<string, unknown>;
}

function validateAndroidGoogleServices(buffer: Uint8Array) {
  const json = assertObject(parseJson(buffer));
  const clients = Array.isArray(json.client) ? json.client : [];
  const packageNames = clients.flatMap((client) => {
    if (!client || typeof client !== 'object') {
      return [];
    }

    const info = (client as Record<string, unknown>).client_info;
    if (!info || typeof info !== 'object') {
      return [];
    }

    const androidInfo = (info as Record<string, unknown>).android_client_info;
    if (!androidInfo || typeof androidInfo !== 'object') {
      return [];
    }

    const packageName = (androidInfo as Record<string, unknown>).package_name;
    return typeof packageName === 'string' ? [packageName] : [];
  });

  if (!packageNames.includes(EXPECTED_ANDROID_PACKAGE_NAME)) {
    throw new MobileDeploymentValidationError(
      `google-services.json must include ${EXPECTED_ANDROID_PACKAGE_NAME}`
    );
  }
}

function validateGooglePlayServiceAccount(buffer: Uint8Array) {
  const json = assertObject(parseJson(buffer));

  if (json.type !== 'service_account') {
    throw new MobileDeploymentValidationError(
      'Google Play credentials must be a service account JSON file'
    );
  }

  if (
    typeof json.client_email !== 'string' ||
    !json.client_email.includes('@')
  ) {
    throw new MobileDeploymentValidationError(
      'Google Play service account JSON must include client_email'
    );
  }

  if (
    typeof json.private_key !== 'string' ||
    !json.private_key.includes('PRIVATE KEY')
  ) {
    throw new MobileDeploymentValidationError(
      'Google Play service account JSON must include a private key'
    );
  }
}

function validateIosPlist(buffer: Uint8Array) {
  const text = new TextDecoder().decode(buffer);

  if (!text.includes('<plist') || !text.includes('</plist>')) {
    throw new MobileDeploymentValidationError(
      'GoogleService-Info.plist must be a plist file'
    );
  }

  if (!text.includes(EXPECTED_IOS_BUNDLE_ID)) {
    throw new MobileDeploymentValidationError(
      `GoogleService-Info.plist must include ${EXPECTED_IOS_BUNDLE_ID}`
    );
  }
}

function validateAppStoreConnectPrivateKey(buffer: Uint8Array) {
  const text = new TextDecoder().decode(buffer).trim();

  if (
    !text.startsWith('-----BEGIN PRIVATE KEY-----') ||
    !text.endsWith('-----END PRIVATE KEY-----')
  ) {
    throw new MobileDeploymentValidationError(
      'App Store Connect private key must be a .p8 PEM private key'
    );
  }
}

function validateProvisioningProfile(buffer: Uint8Array) {
  const text = new TextDecoder().decode(buffer);

  if (
    !text.includes(EXPECTED_IOS_BUNDLE_ID) ||
    !text.includes('Entitlements')
  ) {
    throw new MobileDeploymentValidationError(
      `Provisioning profile must include ${EXPECTED_IOS_BUNDLE_ID} entitlements`
    );
  }
}

export function validateFileArtifact(
  kind: MobileDeploymentFileKind,
  buffer: Uint8Array
) {
  if (buffer.byteLength === 0) {
    throw new MobileDeploymentValidationError('File is empty');
  }

  if (buffer.byteLength > MAX_MOBILE_DEPLOYMENT_FILE_BYTES) {
    throw new MobileDeploymentValidationError(
      `File exceeds ${MAX_MOBILE_DEPLOYMENT_FILE_BYTES} bytes`
    );
  }

  if (kind === 'android_google_services_json') {
    validateAndroidGoogleServices(buffer);
  } else if (kind === 'google_play_service_account_json') {
    validateGooglePlayServiceAccount(buffer);
  } else if (kind === 'ios_google_service_info_plist') {
    validateIosPlist(buffer);
  } else if (kind === 'app_store_connect_private_key_p8') {
    validateAppStoreConnectPrivateKey(buffer);
  } else if (kind === 'apple_app_store_provisioning_profile') {
    validateProvisioningProfile(buffer);
  }
}

export function renderEnvFile(entries: Record<string, string>) {
  return Object.entries(entries)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
    .concat('\n');
}
