import { Effect } from '@tuturuuu/utils/effect';
import type {
  IdpConfig,
  SamlSigner,
  SpProfile,
  ValidatedRequest,
} from '../contracts';
import { createLoginResponse } from '../saml/response';
import {
  authorizeIdentity,
  type IssuancePolicy,
  type IssuancePrincipal,
  SsoError,
} from './policy';

export interface LoginTransaction {
  id: string;
  handle: string;
  browserHash: string;
  expiresAt: string;
  request: ValidatedRequest;
  policy: IssuancePolicy;
}
export interface IssuanceDependencies {
  enabled(): boolean;
  now(): Date;
  generateId(): string;
  current(): Promise<{
    policy: IssuancePolicy;
    principal: IssuancePrincipal;
    profile: SpProfile;
    idp: IdpConfig;
  }>;
  prepareSigner(): Promise<SamlSigner>;
  consent(approved: boolean, principal: IssuancePrincipal): Promise<void>;
  consume(principal: IssuancePrincipal): Promise<string>;
  finalize(principal: IssuancePrincipal): Promise<void>;
  failed(consumed: boolean): Promise<void>;
}

/** No retries: consumption and finalization can have unknown committed outcomes. */
export async function decideLogin(
  tx: LoginTransaction,
  approved: boolean,
  d: IssuanceDependencies
) {
  let consumed = false;
  const attempt = Effect.tryPromise({
    try: async () => {
      if (!d.enabled()) throw new SsoError({ code: 'disabled' });
      if (Date.parse(tx.expiresAt) <= d.now().getTime())
        throw new SsoError({ code: 'expired' });
      const current = await d.current();
      const samePolicy = (policy: IssuancePolicy) => {
        if (
          policy.clientId !== tx.policy.clientId ||
          policy.workspaceId !== tx.policy.workspaceId ||
          policy.revision !== tx.policy.revision ||
          policy.keyId !== tx.policy.keyId ||
          policy.keyRevision !== tx.policy.keyRevision
        )
          throw new SsoError({ code: 'forbidden' });
      };
      samePolicy(current.policy);
      const claims = authorizeIdentity({
        ...current,
        request: tx.request,
        now: d.now(),
      });
      const signer = await d.prepareSigner();
      await d.consent(approved, current.principal);
      if (!approved) return { kind: 'denied' as const };
      const started = d.now().getTime();
      // Mark before dispatch, so an unknown consume result is never retried.
      consumed = true;
      const pairwiseSubject = await d.consume(current.principal);
      const response = createLoginResponse(
        {
          ...current,
          request: tx.request,
          identity: {
            pairwiseSubject,
            email: claims.email,
            firstName: claims.firstName,
            lastName: claims.lastName,
          },
          assurance: claims.assurance,
        },
        { signer, now: d.now, generateId: d.generateId }
      );
      const final = await d.current();
      samePolicy(final.policy);
      if (
        final.idp.signingCertificate !== current.idp.signingCertificate ||
        final.profile.entityId !== current.profile.entityId ||
        final.profile.acsUrl !== current.profile.acsUrl ||
        final.idp.entityId !== current.idp.entityId
      )
        throw new SsoError({ code: 'forbidden' });
      authorizeIdentity({ ...final, request: tx.request, now: d.now() });
      if (
        final.principal.userId !== current.principal.userId ||
        final.principal.sessionId !== current.principal.sessionId ||
        final.principal.email !== current.principal.email ||
        final.principal.mfaAt !== current.principal.mfaAt
      ) {
        throw new SsoError({ code: 'forbidden' });
      }
      const checkDeadline = () => {
        if (!d.enabled()) throw new SsoError({ code: 'disabled' });
        const elapsed = d.now().getTime() - started;
        if (
          elapsed < 0 ||
          elapsed > 5000 ||
          Date.parse(tx.expiresAt) <= d.now().getTime()
        ) {
          throw new SsoError({ code: 'expired' });
        }
      };
      checkDeadline();
      await d.finalize(current.principal);
      checkDeadline();
      authorizeIdentity({ ...final, request: tx.request, now: d.now() });
      return { kind: 'issued' as const, response };
    },
    catch: (error) =>
      error instanceof SsoError ? error : new SsoError({ code: 'unavailable' }),
  });
  const result = await Effect.runPromise(Effect.either(attempt));
  if (result._tag === 'Right') return result.right;
  try {
    await d.failed(consumed);
  } catch {
    throw new SsoError({ code: 'unavailable' });
  }
  throw result.left;
}
