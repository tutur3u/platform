'use server';

import { AdminsResponse } from './challengeForm';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  NovaChallenge,
  NovaChallengeCriteria,
  NovaChallengeWhitelistedEmail,
} from '@tuturuuu/types/db';

type ExtendedNovaChallenge = NovaChallenge & {
  criteria: NovaChallengeCriteria[];
  whitelists: NovaChallengeWhitelistedEmail[];
  canManage: boolean;
  managingAdmins?: string[];
};

export async function fetchChallenges(): Promise<ExtendedNovaChallenge[]> {
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
      .from('nova_roles')
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
      userRole?.allow_role_management ||
      userRole?.allow_manage_all_challenges ||
      false;

    // Fetch all challenges
    const { data: challenges, error: challengesError } = await sbAdmin
      .from('nova_challenges')
      .select('*')
      .order('created_at', { ascending: false });

    if (challengesError) {
      throw new Error('Error fetching challenges:', challengesError);
    }

    // Fetch all criteria for the challenges
    const { data: allCriteria, error: criteriaError } = await sbAdmin
      .from('nova_challenge_criteria')
      .select('*')
      .in(
        'challenge_id',
        challenges.map((challenge) => challenge.id)
      );

    if (criteriaError) {
      throw new Error('Error fetching criteria:', criteriaError);
    }

    // Fetch all whitelists for the challenges
    const { data: allWhitelists, error: whitelistsError } = await sbAdmin
      .from('nova_challenge_whitelisted_emails')
      .select('*')
      .in(
        'challenge_id',
        challenges.map((challenge) => challenge.id)
      );

    if (whitelistsError) {
      throw new Error('Error fetching whitelists:', whitelistsError);
    }

    const userWhitelistedChallengeIds = new Set(
      allWhitelists
        ?.filter((whitelist) => whitelist.email === user.email)
        .map((whitelist) => whitelist.challenge_id) || []
    );

    const { data: managedChallenges, error: managerError } = await sbAdmin
      .from('nova_challenge_manager_emails')
      .select('challenge_id')
      .eq('admin_email', user.email);

    if (managerError) {
      console.error('Error fetching managed challenges:', managerError);
    }

    // Build a Set of challenge IDs this admin can manage
    const managedChallengeIds = new Set(
      (managedChallenges || []).map((item) => item.challenge_id)
    );

    let filteredChallenges = [];

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
      console.error('Error fetching challenge managers:', managersError);
    }

    // Combine all data
    return filteredChallenges.map((challenge) => ({
      ...challenge,
      password_salt: challenge.password_salt !== null ? '' : null,
      password_hash: challenge.password_hash !== null ? '' : null,
      criteria:
        allCriteria?.filter((c) => c.challenge_id === challenge.id) || [],
      whitelists: isAdmin
        ? allWhitelists?.filter((w) => w.challenge_id === challenge.id) || []
        : [],
      canManage: isSuperAdmin || managedChallengeIds.has(challenge.id),
      managingAdmins:
        allManagers
          ?.filter((m) => m.challenge_id === challenge.id)
          .map((m) => m.admin_email) || [],
    }));
  } catch (error) {
    console.error('Error fetching challenges:', error);
    return [];
  }
}

export async function fetchAdmins(): Promise<AdminsResponse> {
  try {
    const supabase = await createClient();
    const sbAdmin = await createAdminClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user?.email) {
      throw new Error('Auth error or missing user');
    }

    // Check if the requester has permission to see admins
    const { data: userRole, error: roleError } = await sbAdmin
      .from('nova_roles')
      .select(
        'allow_challenge_management, allow_manage_all_challenges, allow_role_management'
      )
      .eq('email', user.email)
      .single();

    if (roleError) {
      console.error('Error fetching user role:', roleError);
      throw new Error('Error fetching user permissions');
    }

    // Only allow admins to fetch other admins
    if (
      !userRole?.allow_challenge_management &&
      !userRole?.allow_manage_all_challenges &&
      !userRole?.allow_role_management
    ) {
      throw new Error('Insufficient permissions to view administrators');
    }

    // Fetch only regular challenge admins (not super admins)
    const { data: admins, error: adminsError } = await sbAdmin
      .from('nova_roles')
      .select('email, enabled, allow_challenge_management')
      .eq('enabled', true)
      .eq('allow_challenge_management', true)
      .eq('allow_manage_all_challenges', false)
      .eq('allow_role_management', false)
      .order('email');

    if (adminsError) {
      console.error('Error fetching admins:', adminsError);
      throw new Error('Failed to fetch administrators');
    }

    const emails = (admins || [])
      .filter((admin) => admin.email !== null)
      .map((admin) => admin.email as string);

    return { admins: emails };
  } catch (error) {
    console.error('Error in getAdmins:', error);
    return { admins: [], error: String(error) };
  }
}
