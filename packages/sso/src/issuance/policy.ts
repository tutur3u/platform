import { Data } from '@tuturuuu/utils/effect';
import { z } from 'zod';
import { identitySchema, type ValidatedRequest } from '../contracts';

export class SsoError extends Data.TaggedError('SsoError')<{
  code: 'unavailable' | 'forbidden' | 'mfa_required' | 'expired' | 'disabled';
}> {}

export interface IssuancePolicy {
  clientId: string;
  workspaceId: string;
  revision: number;
  domains: string[];
  member: boolean;
  assigned: boolean;
  keyId: string;
  keyRevision: number;
}

export const principalSchema = z.object({
  userId: z.uuid(),
  sessionId: z.string().min(1),
  email: z.email().max(254),
  firstName: identitySchema.shape.firstName,
  lastName: identitySchema.shape.lastName,
  emailConfirmed: z.boolean(),
  accountAllowed: z.boolean(),
  factorCurrent: z.boolean(),
  primaryAt: z.number().int().nonnegative(),
  mfaAt: z.number().int().nonnegative(),
});
export type IssuancePrincipal = z.infer<typeof principalSchema>;

export function authorizeIdentity(input: {
  policy: IssuancePolicy;
  principal: IssuancePrincipal;
  request: ValidatedRequest;
  now: Date;
}) {
  const { policy, principal: p, request, now } = input;
  if (
    !policy.member ||
    !policy.assigned ||
    !p.accountAllowed ||
    !p.emailConfirmed ||
    !policy.domains.includes(
      p.email.slice(p.email.lastIndexOf('@') + 1).toLowerCase()
    )
  ) {
    throw new SsoError({ code: 'forbidden' });
  }
  const seconds = now.getTime() / 1000;
  if (
    !p.factorCurrent ||
    p.mfaAt > seconds ||
    seconds - p.mfaAt > 600 ||
    p.primaryAt > p.mfaAt ||
    (request.forceAuthn &&
      Math.min(p.primaryAt, p.mfaAt) * 1000 < Date.parse(request.issueInstant))
  ) {
    throw new SsoError({ code: 'mfa_required' });
  }
  return {
    email: p.email,
    firstName: p.firstName,
    lastName: p.lastName,
    assurance: {
      method: 'totp-mfa' as const,
      authenticatedAt: new Date(p.primaryAt * 1000).toISOString(),
      mfaVerifiedAt: new Date(p.mfaAt * 1000).toISOString(),
    },
  };
}
