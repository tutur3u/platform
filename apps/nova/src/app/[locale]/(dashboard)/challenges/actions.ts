'use server';

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

    // Filter challenges if user doesn't have management permissions
    let filteredChallenges = challenges;
    if (!userRole?.allow_challenge_management) {
      // Fetch whitelists for this user
      const { data: whitelistedChallengeIds, error: whitelistError } =
        await sbAdmin
          .from('nova_challenge_whitelisted_emails')
          .select('challenge_id')
          .eq('email', user.email);

      if (whitelistError) {
        throw new Error('Error fetching user whitelists:', whitelistError);
      }

      // Filter to only include challenges that have the user's email whitelisted
      filteredChallenges = challenges.filter((challenge) => {
        return (
          challenge.enabled &&
          (!challenge.whitelisted_only ||
            whitelistedChallengeIds.some(
              (whitelist) => whitelist.challenge_id === challenge.id
            ))
        );
      });
    }

    // Combine all data
    return filteredChallenges.map((challenge) => ({
      ...challenge,
      criteria:
        allCriteria?.filter((c) => c.challenge_id === challenge.id) || [],
      whitelists:
        allWhitelists?.filter((w) => w.challenge_id === challenge.id) || [],
    }));
  } catch (error) {
    console.error('Error fetching challenges:', error);
    return [];
  }
}
