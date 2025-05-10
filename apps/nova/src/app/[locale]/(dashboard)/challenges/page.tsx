import ChallengesList from './ChallengesList';
import CreateChallengeDialog from './createChallengeDialog';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { NovaExtendedChallenge } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import { Plus } from '@tuturuuu/ui/icons';
import { getTranslations } from 'next-intl/server';

export default async function Page() {
  const t = await getTranslations('nova');

  const sbAdmin = await createAdminClient();
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id || !user?.email) {
    throw new Error('Auth error or missing user');
  }

  // Check user's role and permissions
  const { data: userRole, error: roleError } = await sbAdmin
    .from('nova_roles')
    .select('*')
    .eq('email', user.email)
    .single();

  if (roleError || !userRole) {
    throw new Error(`Error fetching user role: ${roleError}`);
  }

  const isAdmin = userRole.allow_challenge_management;
  const isSuperAdmin = isAdmin && userRole.allow_manage_all_challenges;

  const challenges = await fetchChallenges();

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-0">
        <h1 className="text-3xl font-bold">
          {t('challenges-page.prompt-engineering-challenges')}
        </h1>
        {isSuperAdmin && (
          <CreateChallengeDialog
            trigger={
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                {t('challenges-page.create-challenge')}
              </Button>
            }
          />
        )}
      </div>
      <ChallengesList isAdmin={isAdmin} challenges={challenges} />
    </div>
  );
}

async function fetchChallenges(): Promise<NovaExtendedChallenge[]> {
  try {
    const sbAdmin = await createAdminClient();
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user?.id || !user?.email) {
      throw new Error('Auth error or missing user');
    }

    // Check user's role and permissions
    const { data: userRole, error: roleError } = await sbAdmin
      .from('nova_roles')
      .select('*')
      .eq('email', user.email)
      .single();

    if (roleError || !userRole) {
      throw new Error(`Error fetching user role: ${roleError}`);
    }

    const isAdmin = userRole.allow_challenge_management;
    const isSuperAdmin = isAdmin && userRole.allow_manage_all_challenges;

    // Fetch all challenges with user stats
    const { data: challengesWithStats, error: challengesError } =
      await sbAdmin.rpc('nova_get_all_challenges_with_user_stats', {
        user_id: user.id,
      });

    if (challengesError) {
      throw new Error('Error fetching challenges: ' + challengesError.message);
    }

    // Convert to usable format
    const challenges = (challengesWithStats || []) as NovaExtendedChallenge[];

    // Fetch user's whitelisted challenges
    const { data: allWhitelists, error: whitelistsError } = await sbAdmin
      .from('nova_challenge_whitelisted_emails')
      .select('*')
      .in(
        'challenge_id',
        challenges.map((challenge) => challenge.id)
      );

    if (whitelistsError) {
      throw new Error('Error fetching whitelists: ' + whitelistsError.message);
    }

    const userWhitelistedChallengeIds = new Set(
      allWhitelists
        ?.filter((whitelist) => whitelist.email === user.email)
        .map((whitelist) => whitelist.challenge_id) || []
    );

    if (isAdmin) {
      const { data: allCriteria, error: criteriaError } = await sbAdmin
        .from('nova_challenge_criteria')
        .select('*')
        .in(
          'challenge_id',
          challenges.map((challenge) => challenge.id)
        );

      if (criteriaError) {
        throw new Error('Error fetching criteria: ' + criteriaError.message);
      }

      const { data: allManagers, error: managedError } = await sbAdmin
        .from('nova_challenge_manager_emails')
        .select('*');

      if (managedError) {
        throw new Error(
          `Failed to fetch challenge managers: ${managedError.message}`
        );
      }

      const { data: managedChallenges, error: managerError } = await sbAdmin
        .from('nova_challenge_manager_emails')
        .select('challenge_id')
        .eq('email', user.email);

      if (managerError) {
        console.error('Error fetching managed challenges:', managerError);
      }

      const managedChallengeIds = new Set(
        (managedChallenges || []).map((item) => item.challenge_id)
      );

      return challenges.map((challenge) => ({
        ...challenge,
        password_salt: challenge.password_salt !== null ? '' : null,
        password_hash: challenge.password_hash !== null ? '' : null,
        criteria:
          allCriteria?.filter((c) => c.challenge_id === challenge.id) || [],
        whitelists:
          allWhitelists?.filter((w) => w.challenge_id === challenge.id) || [],
        canManage: isSuperAdmin || managedChallengeIds.has(challenge.id),
        managingAdmins:
          allManagers
            ?.filter((m) => m.challenge_id === challenge.id)
            .map((m) => m.email) || [],
      }));
    }

    // Regular users only see challenges that are enabled or they're whitelisted for
    const filteredChallenges = challenges.filter((challenge) => {
      const previewableAt = challenge.previewable_at
        ? new Date(challenge.previewable_at)
        : null;
      const now = new Date();

      return (
        challenge.enabled &&
        (!challenge.whitelisted_only ||
          userWhitelistedChallengeIds.has(challenge.id)) &&
        (previewableAt ? now >= previewableAt : true)
      );
    });

    return filteredChallenges.map((challenge) => ({
      ...challenge,
      password_salt: challenge.password_salt !== null ? '' : null,
      password_hash: challenge.password_hash !== null ? '' : null,
    }));
  } catch (error) {
    console.error('Error fetching challenges:', error);
    return [];
  }
}
