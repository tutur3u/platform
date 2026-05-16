import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { getNovaPlatformRole, type NovaPlatformRole } from '@/lib/app-session';

type NovaChallengeAccessUser = Pick<SupabaseUser, 'email' | 'id'>;

export function canManageNovaChallenges(role?: NovaPlatformRole | null) {
  return Boolean(
    role?.enabled &&
      (role.allow_challenge_management ||
        role.allow_manage_all_challenges ||
        role.allow_role_management)
  );
}

export function canManageAllNovaChallenges(role?: NovaPlatformRole | null) {
  return Boolean(
    role?.enabled &&
      (role.allow_manage_all_challenges || role.allow_role_management)
  );
}

export async function canManageNovaChallengesGlobally(
  user: Pick<SupabaseUser, 'id'>,
  sbAdmin?: TypedSupabaseClient
) {
  const client = sbAdmin ?? (await createAdminClient({ noCookie: true }));
  const role = await getNovaPlatformRole(user.id, client);

  return canManageAllNovaChallenges(role);
}

export async function canManageNovaChallenge(
  user: NovaChallengeAccessUser,
  challengeId: string,
  sbAdmin?: TypedSupabaseClient
) {
  const client = sbAdmin ?? (await createAdminClient({ noCookie: true }));
  const role = await getNovaPlatformRole(user.id, client);

  if (!canManageNovaChallenges(role)) return false;
  if (canManageAllNovaChallenges(role)) return true;
  if (!role?.allow_challenge_management || !user.email) return false;

  const { data, error } = await client
    .from('nova_challenge_manager_emails')
    .select('challenge_id')
    .eq('challenge_id', challengeId)
    .eq('email', user.email)
    .maybeSingle();

  return !error && Boolean(data);
}

export async function getNovaCriterionChallengeId(
  criterionId: string,
  sbAdmin: TypedSupabaseClient
) {
  const { data, error } = await sbAdmin
    .from('nova_challenge_criteria')
    .select('challenge_id')
    .eq('id', criterionId)
    .maybeSingle();

  return { challengeId: data?.challenge_id ?? null, error };
}

export async function getNovaProblemChallengeId(
  problemId: string,
  sbAdmin: TypedSupabaseClient
) {
  const { data, error } = await sbAdmin
    .from('nova_problems')
    .select('challenge_id')
    .eq('id', problemId)
    .maybeSingle();

  return { challengeId: data?.challenge_id ?? null, error };
}

export async function getNovaTestCaseChallengeId(
  testCaseId: string,
  sbAdmin: TypedSupabaseClient
) {
  const { data, error } = await sbAdmin
    .from('nova_problem_test_cases')
    .select('problem_id')
    .eq('id', testCaseId)
    .maybeSingle();

  if (error || !data?.problem_id) {
    return { challengeId: null, error };
  }

  return getNovaProblemChallengeId(data.problem_id, sbAdmin);
}
