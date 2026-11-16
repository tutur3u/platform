import { z } from 'zod';
import { AccountManagementError, requireFreshFactor } from './policy';

const verifiedHumanSchema = z.object({
  actorId: z.uuid(),
  sessionId: z.uuid(),
  verifiedClaims: z.unknown(),
});

export type VerifiedHuman = z.infer<typeof verifiedHumanSchema>;

export interface HumanAuthority {
  /** Resolve the actor's live root-workspace permission; do not cache across requests. */
  hasRootRolePermission(actorId: string): Promise<boolean>;
  /** Read enabled AND allow_role_management from the platform role row. */
  hasEnabledPlatformRole(actorId: string): Promise<boolean>;
  /** Only this actor/session's server-owned, fresh TOTP verification record. */
  hasFreshTotpStepUp(actorId: string, sessionId: string): Promise<boolean>;
}

/** Only a verified session resolver may construct the input; request JSON is not identity. */
export async function authorizeHuman(
  human: VerifiedHuman,
  authority: HumanAuthority,
  nowSeconds: number
) {
  const parsed = verifiedHumanSchema.safeParse(human);
  if (!parsed.success) throw new AccountManagementError('unauthorized', 401);
  const { actorId, sessionId, verifiedClaims } = parsed.data;
  // Sequential reads keep each authority check explicit and avoid broadening either one.
  if (
    !(await authority.hasRootRolePermission(actorId)) ||
    !(await authority.hasEnabledPlatformRole(actorId))
  ) {
    throw new AccountManagementError('forbidden', 403);
  }
  // Generic app-session MFA proofs do not preserve factor-method provenance.
  // A server-owned TOTP record is bound to the exact authenticated session.
  try {
    requireFreshFactor(verifiedClaims, nowSeconds);
  } catch (error) {
    if (
      !(error instanceof AccountManagementError) ||
      error.code !== 'step_up_required'
    )
      throw error;
    if (!(await authority.hasFreshTotpStepUp(actorId, sessionId))) throw error;
  }
  return { actorId, sessionId };
}
