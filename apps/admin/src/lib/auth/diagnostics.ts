import { randomBytes } from 'node:crypto';

export type AuthDiagnosticStage =
  | 'account_list'
  | 'account_logout'
  | 'account_logout_all'
  | 'account_remove'
  | 'account_save'
  | 'account_switch'
  | 'account_update'
  | 'auth_recovery'
  | 'auth_recovery_confirm'
  | 'auth_recovery_consume'
  | 'oauth_callback_exchange'
  | 'otp_send'
  | 'otp_settings'
  | 'otp_verify'
  | 'password_login'
  | 'passkey_fallback';

type ReturnUrlKind =
  | 'external'
  | 'invalid'
  | 'local'
  | 'missing'
  | 'same-origin'
  | 'unsupported';
type AuthDiagnosticLevel = 'error' | 'warn';

const AUTH_DIAGNOSTIC_PREFIXES: Record<AuthDiagnosticStage, string> = {
  account_list: 'AUTH-ACC-LIST',
  account_logout: 'AUTH-ACC-LOGOUT',
  account_logout_all: 'AUTH-ACC-LOGOUT-ALL',
  account_remove: 'AUTH-ACC-REMOVE',
  account_save: 'AUTH-ACC-SAVE',
  account_switch: 'AUTH-ACC-SWITCH',
  account_update: 'AUTH-ACC-UPDATE',
  auth_recovery: 'AUTH-RECOVERY',
  auth_recovery_confirm: 'AUTH-RECOVERY-CONFIRM',
  auth_recovery_consume: 'AUTH-RECOVERY-CONSUME',
  oauth_callback_exchange: 'AUTH-OAUTH',
  otp_send: 'AUTH-OTP-SEND',
  otp_settings: 'AUTH-OTP-SETTINGS',
  otp_verify: 'AUTH-OTP-VERIFY',
  passkey_fallback: 'AUTH-PASSKEY',
  password_login: 'AUTH-PASSWORD',
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === 'string' ? error : String(error);
}

export function createAuthDiagnosticCode(stage: AuthDiagnosticStage) {
  return `${AUTH_DIAGNOSTIC_PREFIXES[stage]}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

export function getReturnUrlKind(
  returnUrl: string | null | undefined,
  requestOrigin?: string | null
): ReturnUrlKind {
  if (!returnUrl) {
    return 'missing';
  }

  try {
    const decodedUrl = decodeURIComponent(returnUrl);

    if (decodedUrl.startsWith('/')) {
      return 'local';
    }

    const url = new URL(decodedUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return 'unsupported';
    }

    return requestOrigin && url.origin === requestOrigin
      ? 'same-origin'
      : 'external';
  } catch {
    return 'invalid';
  }
}

export function logAuthDiagnostic({
  authMethod,
  client,
  code,
  error,
  level = 'error',
  message,
  platform,
  request,
  returnUrlKind,
  route,
  stage,
  status,
}: {
  authMethod?: string;
  client?: string | null;
  code: string;
  error?: unknown;
  level?: AuthDiagnosticLevel;
  message: string;
  platform?: string | null;
  request?: Request;
  returnUrlKind?: ReturnUrlKind;
  route: string;
  stage: AuthDiagnosticStage;
  status?: number;
}) {
  const log = level === 'warn' ? console.warn : console.error;

  log(message, {
    authMethod,
    client: client || undefined,
    diagnosticCode: code,
    error: error === undefined ? undefined : getErrorMessage(error),
    method: request?.method,
    platform: platform || undefined,
    returnUrlKind,
    route,
    stage,
    status,
  });
}
