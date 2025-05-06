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
import { redirect } from 'next/navigation';

export default async function Page() {
  const sbAdmin = await createAdminClient();
  const supabase = await createClient();
  const t = await getTranslations('nova');

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) redirect('/login');

  const { data: whitelisted } = await sbAdmin
    .from('platform_user_roles')
    .select(
      'enabled, allow_challenge_management, allow_manage_all_challenges, allow_role_management'
    )
    .eq('user_id', user?.id)
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
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-0">
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
      .from('platform_user_roles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (roleError) {
      console.error('Error fetching user role:', roleError);
      // Continue without special role
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

    const challenges = (challengesWithStats || []) as NovaExtendedChallenge[];

    // Fetch all whitelists for the challenges
    const { data: allWhitelists, error: whitelistsError } = await sbAdmin
      .from('nova_challenge_whitelisted_emails')
      .select('*')
      .in(
        'challenge_id',
        challenges.map((challenge: NovaExtendedChallenge) => challenge.id)
      );

    if (whitelistsError) {
      throw new Error('Error fetching whitelists: ' + whitelistsError.message);
    }

    const userWhitelistedChallengeIds = new Set(
      allWhitelists
        ?.filter((whitelist) => whitelist.email === user.email)
        .map((whitelist) => whitelist.challenge_id) || []
    );

    // Initialize variables with default/empty values
    let filteredChallenges: NovaExtendedChallenge[] = [];
    let allCriteria: any[] = [];
    let allManagers: any[] = [];
    let managedChallengeIds = new Set();

    // Determine which challenges the user can see based on their role
    if (isSuperAdmin) {
      // Super admin - can see and manage everything
      filteredChallenges = challenges;

      // Fetch all criteria for the challenges
      const { data: criteria, error: criteriaError } = await sbAdmin
        .from('nova_challenge_criteria')
        .select('*')
        .in(
          'challenge_id',
          challenges.map((challenge) => challenge.id)
        );

      if (criteriaError) {
        throw new Error('Error fetching criteria: ' + criteriaError.message);
      }

      allCriteria = criteria || [];

      // Get admin list for the challenges
      const { data: managers, error: managersError } = await sbAdmin
        .from('nova_challenge_manager_emails')
        .select('*');

      if (managersError) {
        throw new Error(
          `Failed to fetch challenge managers: ${managersError.message}`
        );
      }

      allManagers = managers || [];

      // Even for super admins, track challenges they directly manage
      const { data: managedChallenges, error: managerError } = await sbAdmin
        .from('nova_challenge_manager_emails')
        .select('challenge_id')
        .eq('email', user.email);

      if (managerError) {
        console.error('Error fetching managed challenges:', managerError);
      } else {
        // Build a Set of challenge IDs this admin can manage
        managedChallengeIds = new Set(
          (managedChallenges || []).map((item) => item.challenge_id)
        );
      }
    } else if (userRole?.allow_challenge_management) {
      // Normal admins - fetch their managed challenges
      const { data: managedChallenges, error: managerError } = await sbAdmin
        .from('nova_challenge_manager_emails')
        .select('challenge_id')
        .eq('email', user.email);

      if (managerError) {
        console.error('Error fetching managed challenges:', managerError);
      } else {
        // Build a Set of challenge IDs this admin can manage
        managedChallengeIds = new Set(
          (managedChallenges || []).map((item) => item.challenge_id)
        );
      }

      // Normal admins - can see all user-visible challenges + challenges they can manage
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

      // Fetch criteria only for challenges this admin can see
      const { data: criteria, error: criteriaError } = await sbAdmin
        .from('nova_challenge_criteria')
        .select('*')
        .in(
          'challenge_id',
          filteredChallenges.map((challenge) => challenge.id)
        );

      if (criteriaError) {
        throw new Error('Error fetching criteria: ' + criteriaError.message);
      }

      allCriteria = criteria || [];

      // Get all managers
      const { data: managers, error: managersError } = await sbAdmin
        .from('nova_challenge_manager_emails')
        .select('*');

      if (managersError) {
        throw new Error(
          `Failed to fetch challenge managers: ${managersError.message}`
        );
      }

      allManagers = managers || [];
    } else {
      // Regular Users - can only see enabled non-restricted challenges
      filteredChallenges = challenges.filter(
        (challenge) =>
          challenge.enabled &&
          (!challenge.whitelisted_only ||
            userWhitelistedChallengeIds.has(challenge.id))
      );
    }

    // Single return point for all user types
    return filteredChallenges.map((challenge) => ({
      ...challenge,
      password_salt: challenge.password_salt !== null ? '' : null,
      password_hash: challenge.password_hash !== null ? '' : null,
      criteria:
        allCriteria?.filter((c) => c.challenge_id === challenge.id) || [],
      whitelists: isAdmin
        ? allWhitelists?.filter((w) => w.challenge_id === challenge.id) || []
        : [],
      canManage: isSuperAdmin || managedChallengeIds.has(challenge.id) || false,
      managingAdmins:
        allManagers
          ?.filter((m) => m.challenge_id === challenge.id)
          .map((m) => m.email) || [],
    }));
  } catch (error) {
    console.error('Error fetching challenges:', error);
    return [];
  }
}
