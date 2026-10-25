import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { NovaChallenge } from '@tuturuuu/types';
import { getNovaPlatformRole, type NovaPlatformRole } from '@/lib/app-session';
import {
  canManageAllNovaChallenges,
  canManageNovaChallenges,
} from '@/lib/challenge-management-auth';

type NovaCatalogUser = Pick<SupabaseUser, 'email' | 'id'>;

export type NovaCatalogActor =
  | { kind: 'global-manager'; user: NovaCatalogUser }
  | {
      challengeIds: ReadonlySet<string>;
      kind: 'assigned-manager';
      user: NovaCatalogUser;
    }
  | { kind: 'participant'; user: NovaCatalogUser }
  | { kind: 'denied'; user: NovaCatalogUser };

export type NovaChallengeCatalogAccess =
  | 'global-manager'
  | 'assigned-manager'
  | 'eligible-participant'
  | 'denied';

type ParticipantVisibleChallenge = Pick<
  NovaChallenge,
  'enabled' | 'id' | 'previewable_at' | 'whitelisted_only'
>;

export function toParticipantChallenge(challenge: NovaChallenge) {
  return {
    id: challenge.id,
    title: challenge.title,
    description: challenge.description,
    duration: challenge.duration,
    max_attempts: challenge.max_attempts,
    max_daily_attempts: challenge.max_daily_attempts,
    open_at: challenge.open_at,
    close_at: challenge.close_at,
    previewable_at: challenge.previewable_at,
    password_protected: challenge.password_hash !== null,
  };
}

export async function resolveNovaCatalogActor({
  getRole = getNovaPlatformRole,
  sbAdmin,
  user,
}: {
  getRole?: (
    userId: string,
    client: TypedSupabaseClient
  ) => Promise<NovaPlatformRole | null>;
  sbAdmin: TypedSupabaseClient;
  user: NovaCatalogUser;
}): Promise<NovaCatalogActor> {
  const role = await getRole(user.id, sbAdmin);

  if (!role?.enabled) return { kind: 'denied', user };
  if (canManageAllNovaChallenges(role)) return { kind: 'global-manager', user };

  if (canManageNovaChallenges(role)) {
    if (!user.email) {
      return { challengeIds: new Set(), kind: 'assigned-manager', user };
    }

    const { data, error } = await sbAdmin
      .schema('private')
      .from('nova_challenge_manager_emails')
      .select('challenge_id')
      .eq('email', user.email);

    if (error) throw error;

    return {
      challengeIds: new Set(
        (data ?? []).map(({ challenge_id }) => challenge_id)
      ),
      kind: 'assigned-manager',
      user,
    };
  }

  return { kind: 'participant', user };
}

export async function resolveNovaChallengeCatalogAccess({
  actor,
  challenge,
  now = new Date(),
  sbAdmin,
  whitelistedChallengeIds,
}: {
  actor: NovaCatalogActor;
  challenge: ParticipantVisibleChallenge;
  now?: Date;
  sbAdmin: TypedSupabaseClient;
  whitelistedChallengeIds?: ReadonlySet<string>;
}): Promise<NovaChallengeCatalogAccess> {
  if (actor.kind === 'denied') return 'denied';
  if (actor.kind === 'global-manager') return 'global-manager';
  if (actor.kind === 'assigned-manager') {
    return actor.challengeIds.has(challenge.id) ? 'assigned-manager' : 'denied';
  }

  if (!challenge.enabled) return 'denied';
  if (
    challenge.previewable_at &&
    new Date(challenge.previewable_at).getTime() > now.getTime()
  ) {
    return 'denied';
  }

  if (!challenge.whitelisted_only) return 'eligible-participant';
  if (!actor.user.email) return 'denied';
  if (whitelistedChallengeIds) {
    return whitelistedChallengeIds.has(challenge.id)
      ? 'eligible-participant'
      : 'denied';
  }

  const { data, error } = await sbAdmin
    .schema('private')
    .from('nova_challenge_whitelisted_emails')
    .select('challenge_id')
    .eq('challenge_id', challenge.id)
    .eq('email', actor.user.email)
    .maybeSingle();

  if (error) throw error;
  return data ? 'eligible-participant' : 'denied';
}

export async function hasActiveNovaChallengeSession({
  challengeId,
  now = new Date(),
  sbAdmin,
  userId,
}: {
  challengeId: string;
  now?: Date;
  sbAdmin: TypedSupabaseClient;
  userId: string;
}) {
  const { data, error } = await sbAdmin
    .schema('private')
    .from('nova_sessions')
    .select('start_time')
    .eq('challenge_id', challengeId)
    .eq('user_id', userId)
    .eq('status', 'IN_PROGRESS')
    .order('start_time', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return false;

  const { data: challenge, error: challengeError } = await sbAdmin
    .schema('private')
    .from('nova_challenges')
    .select('duration, close_at')
    .eq('id', challengeId)
    .maybeSingle();

  if (challengeError) throw challengeError;
  if (!challenge || typeof challenge.duration !== 'number') return false;

  const startTime = new Date(data.start_time).getTime();
  if (!Number.isFinite(startTime) || startTime > now.getTime()) return false;

  const durationEnd = startTime + challenge.duration * 1000;
  const closeTime = challenge.close_at
    ? new Date(challenge.close_at).getTime()
    : Number.POSITIVE_INFINITY;

  return now.getTime() < Math.min(durationEnd, closeTime);
}

export function isManagerCatalogAccess(access: NovaChallengeCatalogAccess) {
  return access === 'global-manager' || access === 'assigned-manager';
}
