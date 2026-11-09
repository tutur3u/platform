import {
  type AppSessionTargetApp,
  verifyAppSessionRequest,
} from '@tuturuuu/auth/app-session';
import type { NextRequest } from 'next/server';
import { getDefaultAppSessionVerificationOptions } from './api-auth-audiences';

type StrictAppSessionAuthOptions = {
  requiredScope?: string | false;
  targetApp?: AppSessionTargetApp | readonly AppSessionTargetApp[];
};

export type AppSessionAuthOptions =
  | boolean
  | StrictAppSessionAuthOptions
  | readonly StrictAppSessionAuthOptions[];

function getAppSessionVerificationOptions(
  request: Pick<NextRequest, 'url'>,
  allowAppSessionAuth:
    | true
    | StrictAppSessionAuthOptions
    | readonly StrictAppSessionAuthOptions[]
): readonly StrictAppSessionAuthOptions[] {
  if (allowAppSessionAuth === true) {
    return [getDefaultAppSessionVerificationOptions(request.url)];
  }

  return isAppSessionAuthOptionsList(allowAppSessionAuth)
    ? allowAppSessionAuth
    : [allowAppSessionAuth];
}

function isAppSessionAuthOptionsList(
  value: StrictAppSessionAuthOptions | readonly StrictAppSessionAuthOptions[]
): value is readonly StrictAppSessionAuthOptions[] {
  return Array.isArray(value);
}

export function verifyConfiguredAppSessionRequest(
  request: Pick<NextRequest, 'headers' | 'url'>,
  allowAppSessionAuth:
    | true
    | StrictAppSessionAuthOptions
    | readonly StrictAppSessionAuthOptions[]
): Extract<ReturnType<typeof verifyAppSessionRequest>, { ok: true }> | null {
  for (const verificationOptions of getAppSessionVerificationOptions(
    request,
    allowAppSessionAuth
  )) {
    const verification = verifyAppSessionRequest(request, verificationOptions);

    if (verification.ok) {
      return verification;
    }
  }

  return null;
}
