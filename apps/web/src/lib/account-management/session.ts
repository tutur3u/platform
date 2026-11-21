import { createHash } from 'node:crypto';
import { verifyCliAccessToken } from '@tuturuuu/auth/cli-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import { AccountManagementError } from './policy';

const audience = 'tuturuuu:accounts:test';
const tokenType = 'tuturuuu-accounts-machine+jwt';
const machineTtl = 120;
const machinePrefix = 'ttr_accounts_machine_';

export type AccountAdmin = TypedSupabaseClient;
export type AccountActor =
  | { kind: 'human'; id: string; sessionId: string }
  | { kind: 'machine'; id: string; credentialId: string };

export async function accountAdmin(
  auditActorId?: string
): Promise<AccountAdmin> {
  return createAdminClient({ noCookie: true, auditActorId });
}

function bearer(request: Request) {
  const token = request.headers
    .get('authorization')
    ?.match(/^Bearer (\S{1,4096})$/iu)?.[1];
  if (!token) throw new AccountManagementError('unauthorized', 401);
  return token;
}

function signingKey() {
  const key = process.env.ACCOUNTS_MACHINE_SIGNING_KEY;
  if (!key || Buffer.byteLength(key) < 32)
    throw new AccountManagementError('unavailable', 503);
  return new TextEncoder().encode(key);
}

export async function resolveAccountActor(
  request: Request,
  allowMachine = false
): Promise<AccountActor> {
  const token = bearer(request);
  if (token.startsWith('ttr_app_')) {
    const result = verifyCliAccessToken(token);
    if (result.ok && result.claims.origin_app === 'cli') {
      const id = z.uuid().safeParse(result.claims.sub);
      const session = z
        .uuid()
        .safeParse(result.claims.mfa?.sessionId ?? result.claims.jti);
      if (id.success && session.success)
        return { kind: 'human', id: id.data, sessionId: session.data };
    }
    throw new AccountManagementError('unauthorized', 401);
  }
  const encoded = token.startsWith(machinePrefix)
    ? token.slice(machinePrefix.length)
    : '';
  if (!allowMachine || !/^[A-Za-z0-9_-]+$/u.test(encoded))
    throw new AccountManagementError('unauthorized', 401);
  const key = signingKey();
  try {
    const jwt = Buffer.from(encoded, 'base64url').toString('ascii');
    const { payload, protectedHeader } = await jwtVerify(jwt, key, {
      algorithms: ['HS256'],
      audience,
      issuer: 'tuturuuu-accounts',
      typ: tokenType,
      maxTokenAge: machineTtl,
      requiredClaims: ['sub', 'iat', 'exp', 'credentialId'],
    });
    if (payload.aud !== audience || protectedHeader.typ !== tokenType)
      throw new AccountManagementError('unauthorized', 401);
    return {
      kind: 'machine',
      id: z.uuid().parse(payload.sub),
      credentialId: z.uuid().parse(payload.credentialId),
    };
  } catch {
    throw new AccountManagementError('unauthorized', 401);
  }
}

export async function exchangeRunnerCredential(
  request: Request,
  admin: AccountAdmin
) {
  const token = bearer(request);
  // The wrapper lets the standard proxy classify the request as authenticated
  // traffic. Only this route accepts the existing runner secret.
  if (!/^ttr_tdbx_[a-f0-9]{64}$/u.test(token))
    throw new AccountManagementError('unauthorized', 401);
  const key = signingKey();
  const result = await admin
    .schema('private')
    .rpc('accounts_machine_credential', {
      p_hash: createHash('sha256').update(token.slice(4)).digest('hex'),
    });
  if (result.error) throw new AccountManagementError('unavailable', 503);
  const enrollment = z
    .object({ runnerId: z.uuid(), credentialId: z.uuid() })
    .safeParse(result.data);
  if (!enrollment.success)
    throw new AccountManagementError('unauthorized', 401);
  const jwt = await new SignJWT({
    credentialId: enrollment.data.credentialId,
  })
    .setProtectedHeader({ alg: 'HS256', typ: tokenType })
    .setSubject(enrollment.data.runnerId)
    .setIssuer('tuturuuu-accounts')
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(`${machineTtl}s`)
    .sign(key);
  // The proxy recognizes ttr_ credentials without treating this machine token
  // as an interactive Supabase bearer. JWT verification stays Accounts-only.
  return {
    accessToken: machinePrefix + Buffer.from(jwt).toString('base64url'),
  };
}
