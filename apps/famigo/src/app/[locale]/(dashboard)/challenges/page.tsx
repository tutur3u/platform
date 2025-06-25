import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { NovaExtendedChallenge } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import { Plus } from '@tuturuuu/ui/icons';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import ChallengesList from './ChallengesList';
import CreateChallengeDialog from './createChallengeDialog';

export default async function Page() {
  const sbAdmin = await createAdminClient();
  const supabase = await createClient();
  const t = await getTranslations('nova');

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) redirect('/login');

  const { data: whitelisted } = await sbAdmin
    .from('platform_email_roles')
    .select(
      'enabled, allow_challenge_management, allow_manage_all_challenges, allow_role_management'
    )
    .eq('email', user?.email as string)
    .maybeSingle();

  const isAdmin = Boolean(
    whitelisted?.enabled && whitelisted?.allow_challenge_management
  );

  //only superAdmin can create new challenge
  const canCreateChallenges = Boolean(
    whitelisted?.allow_manage_all_challenges ||
      whitelisted?.allow_role_management
  );

  const challenges = await fetchChallenges();

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8 flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
        <h1 className="text-3xl font-bold">
          {t('challenges-page.prompt-engineering-challenges')}
        </h1>
        {canCreateChallenges && (
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
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user?.id || !user?.email) {
      throw new Error('Auth error or missing user');
    }

    const sbAdmin = await createAdminClient();

    // Check user's role and permissions
    const { data: userRole, error: roleError } = await sbAdmin
      .from('platform_email_roles')
      .select('*')
      .eq('email', user.email)
      .single();

    if (roleError) {
      throw new Error('Error fetching user role:', roleError);
    }

    const isAdmin =
      userRole?.allow_challenge_management ||
      userRole?.allow_role_management ||
      userRole?.allow_manage_all_challenges ||
      false;

    const isSuperAdmin =
      userRole?.allow_role_management && userRole?.allow_manage_all_challenges;

    // Fetch all challenges with user stats using the RPC function
    const { data: challengesWithStats, error: challengesError } =
      await sbAdmin.rpc('nova_get_all_challenges_with_user_stats', {
        user_id: user.id,
      });

    if (challengesError) {
      throw new Error('Error fetching challenges: ' + challengesError.message);
    }

    // Convert the jsonb array to a usable format
    const challenges = (challengesWithStats || []) as NovaExtendedChallenge[];

    // Fetch all whitelists for the challenges
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

    if (
      userRole?.allow_challenge_management &&
      userRole?.allow_manage_all_challenges
    ) {
      // Fetch all criteria for the challenges
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

      const { data: managedChallenges, error: managerError } = await sbAdmin
        .from('nova_challenge_manager_emails')
        .select('challenge_id')
        .eq('email', user.email);

      if (managerError) {
        console.error('Error fetching managed challenges:', managerError);
      }

      // Build a Set of challenge IDs this admin can manage
      const managedChallengeIds = new Set(
        (managedChallenges || []).map((item) => item.challenge_id)
      );

      let filteredChallenges: NovaExtendedChallenge[] = [];

      // Super admin - can see and manage everything
      if (isSuperAdmin) {
        filteredChallenges = challenges;
      }
      // Normal admins - can see all user-visible challenges + challenges they can manage
      else if (userRole?.allow_challenge_management) {
        filteredChallenges = challenges.filter((challenge) => {
          // Public challenges (enabled and non-restricted)
          if (challenge.enabled && !challenge.whitelisted_only) {
            return true;
          }
          // Specifically assigned to manage
          if (managedChallengeIds.has(challenge.id)) {
            return true;
          }
          // Whitelisted restricted challenges
          if (userWhitelistedChallengeIds.has(challenge.id)) {
            return true;
          }

          return false;
        });
      }
      // Regular Users - can only see enabled non-restricted challenges
      else {
        filteredChallenges = challenges.filter(
          (challenge) =>
            challenge.enabled &&
            (!challenge.whitelisted_only ||
              userWhitelistedChallengeIds.has(challenge.id))
        );
      }

      //get all managers of the challenge
      const { data: allManagers, error: managersError } = await sbAdmin
        .from('nova_challenge_manager_emails')
        .select('*');

      if (managersError) {
        throw new Error(
          `Failed to fetch challenge managers: ${managersError.message}`
        );
      }

      // Add additional properties to challenges
      return filteredChallenges.map((challenge) => ({
        ...challenge,
        password_salt: challenge.password_salt !== null ? '' : null,
        password_hash: challenge.password_hash !== null ? '' : null,
        criteria:
          allCriteria?.filter((c) => c.challenge_id === challenge.id) || [],
        whitelists: isAdmin
          ? allWhitelists?.filter((w) => w.challenge_id === challenge.id) || []
          : [],
        canManage:
          isSuperAdmin || managedChallengeIds.has(challenge.id) || false,
        managingAdmins:
          allManagers
            ?.filter((m) => m.challenge_id === challenge.id)
            .map((m) => m.email) || [],
      }));
    }

    // For regular users, filter challenges that they can access
    return challenges.filter(
      (challenge) =>
        challenge.enabled &&
        (!challenge.whitelisted_only ||
          userWhitelistedChallengeIds.has(challenge.id))
    );
  } catch (error) {
    console.error('Error fetching challenges:', error);
    return [];
  }
}
