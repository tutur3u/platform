const errorNames = new Set([
  'AbortError',
  'AggregateError',
  'AllRecipientsBlockedError',
  'AuthApiError',
  'AuthRetryableFetchError',
  'BlacklistedEmailError',
  'CredentialsError',
  'EmailError',
  'EmailValidationError',
  'Error',
  'InvalidEmailError',
  'MailReadTimeout',
  'MailSendError',
  'MailStorageConfigurationError',
  'NetworkError',
  'NotInitializedError',
  'PostgrestError',
  'ProviderError',
  'RangeError',
  'RateLimitError',
  'ReferenceError',
  'SESError',
  'SyntaxError',
  'TimeoutError',
  'TypeError',
]);

const appErrorCodes = new Set([
  'ALL_RECIPIENTS_BLOCKED',
  'CREDENTIALS_ERROR',
  'EMAIL_BLACKLISTED',
  'EMAIL_VALIDATION_FAILED',
  'INVALID_EMAIL_ADDRESS',
  'MAIL_PROVIDER_REJECTED',
  'MAIL_READ_TIMEOUT',
  'MAIL_SEND_UNCONFIRMED',
  'NETWORK_ERROR',
  'NOT_INITIALIZED',
  'PROVIDER_ERROR',
  'RATE_LIMIT_EXCEEDED',
  'TIMEOUT',
  'UNKNOWN_ERROR',
]);

interface SafeErrorFields {
  name?: string;
  code?: string;
  status?: number;
}

function readField(error: object, field: string): unknown {
  try {
    return Reflect.get(error, field);
  } catch {
    return null;
  }
}

function isErrorCode(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    ((value.length === 5 && /^[0-9A-Z]{5}$/u.test(value)) ||
      (value.length === 8 && /^PGRST[0-9]{3}$/u.test(value)) ||
      (value.length <= 32 && appErrorCodes.has(value)))
  );
}

function safeHttpStatus(value: unknown): number | undefined {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 100 &&
    value <= 599
    ? value
    : undefined;
}

export function safeErrorFields(error: unknown): SafeErrorFields {
  if (typeof error !== 'object' || error === null) return {};

  const name = readField(error, 'name');
  const code = readField(error, 'code');
  const status =
    safeHttpStatus(readField(error, 'status')) ??
    safeHttpStatus(readField(error, 'statusCode'));
  const fields: SafeErrorFields = {};

  if (name !== undefined) {
    fields.name =
      typeof name === 'string' && name.length <= 32 && errorNames.has(name)
        ? name
        : 'other';
  }
  if (code !== undefined) fields.code = isErrorCode(code) ? code : 'other';
  if (status !== undefined) fields.status = status;
  return fields;
}

export function safeLogUuid(value: unknown): string | undefined {
  const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/iu;
  return typeof value === 'string' && value.length === 36 && uuid.test(value)
    ? value
    : undefined;
}
