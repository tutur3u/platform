import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  assertSafeE2EEnvironment,
  LOCAL_E2E_SUPABASE_SECRET_KEY,
  LOCAL_E2E_SUPABASE_URL,
} from './helpers/environment';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? LOCAL_E2E_SUPABASE_URL;
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ?? LOCAL_E2E_SUPABASE_SECRET_KEY;

function serviceHeaders({
  prefer,
  schema = 'private',
}: {
  prefer?: string;
  schema?: 'private' | 'public';
} = {}) {
  return {
    apikey: SUPABASE_SECRET_KEY,
    authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    'content-type': 'application/json',
    'accept-profile': schema,
    'content-profile': schema,
    ...(prefer ? { prefer } : {}),
  };
}

test.describe('Nova runtime private schema API', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('manages sessions, submissions, whitelists, team links, and score views through private REST', async ({
    request,
  }) => {
    const userId = '00000000-0000-0000-0000-000000000001';
    const challengeId = randomUUID();
    const criterionId = randomUUID();
    const problemId = randomUUID();
    const testCaseId = randomUUID();
    const teamId = randomUUID();
    const sessionId = randomUUID();
    const submissionId = randomUUID();
    const email = `nova-runtime-${Date.now()}@example.com`;

    try {
      const createChallengeResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/nova_challenges`,
        {
          data: {
            description: 'Created by private runtime E2E coverage',
            duration: 3600,
            id: challengeId,
            title: 'Private runtime challenge',
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );

      expect(createChallengeResponse.status()).toBe(201);

      const createCriterionResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/nova_challenge_criteria`,
        {
          data: {
            challenge_id: challengeId,
            description: 'Validate runtime score',
            id: criterionId,
            name: 'Score',
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );

      expect(createCriterionResponse.status()).toBe(201);

      const createProblemResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/nova_problems`,
        {
          data: {
            challenge_id: challengeId,
            description: 'Created by private runtime E2E coverage',
            example_input: 'input',
            example_output: 'output',
            id: problemId,
            max_prompt_length: 512,
            title: 'Private runtime problem',
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );

      expect(createProblemResponse.status()).toBe(201);

      const createProblemTestCaseResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/nova_problem_test_cases`,
        {
          data: {
            hidden: false,
            id: testCaseId,
            input: 'input',
            output: 'output',
            problem_id: problemId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );

      expect(createProblemTestCaseResponse.status()).toBe(201);

      const createTeamResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/nova_teams`,
        {
          data: {
            description: 'Created by private runtime E2E coverage',
            id: teamId,
            name: 'Private runtime team',
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );

      expect(createTeamResponse.status()).toBe(201);

      const createWhitelistResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/nova_challenge_whitelisted_emails`,
        {
          data: {
            challenge_id: challengeId,
            email,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );

      expect(createWhitelistResponse.status()).toBe(201);

      const createTeamEmailResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/nova_team_emails`,
        {
          data: {
            email,
            team_id: teamId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );

      expect(createTeamEmailResponse.status()).toBe(201);

      const createTeamMemberResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/nova_team_members`,
        {
          data: {
            team_id: teamId,
            user_id: userId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );

      expect(createTeamMemberResponse.status()).toBe(201);

      const createSessionResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/nova_sessions`,
        {
          data: {
            challenge_id: challengeId,
            id: sessionId,
            start_time: new Date().toISOString(),
            status: 'STARTED',
            user_id: userId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );

      expect(createSessionResponse.status()).toBe(201);

      const createSubmissionResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/nova_submissions`,
        {
          data: {
            id: submissionId,
            problem_id: problemId,
            prompt: 'solve it',
            session_id: sessionId,
            user_id: userId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );

      expect(createSubmissionResponse.status()).toBe(201);

      const createCriterionScoreResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/nova_submission_criteria`,
        {
          data: {
            criteria_id: criterionId,
            feedback: 'good',
            score: 10,
            submission_id: submissionId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );

      expect(createCriterionScoreResponse.status()).toBe(201);

      const createSubmissionTestCaseResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/nova_submission_test_cases`,
        {
          data: {
            matched: true,
            output: 'output',
            submission_id: submissionId,
            test_case_id: testCaseId,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );

      expect(createSubmissionTestCaseResponse.status()).toBe(201);

      const scoreResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/nova_submissions_with_scores?id=eq.${submissionId}&select=id,total_score`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );

      expect(scoreResponse.status()).toBe(200);
      await expect(scoreResponse.json()).resolves.toEqual([
        expect.objectContaining({
          id: submissionId,
          total_score: 10,
        }),
      ]);

      const userLeaderboardResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/nova_user_leaderboard?user_id=eq.${userId}&select=user_id,score`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );

      expect(userLeaderboardResponse.status()).toBe(200);
      await expect(userLeaderboardResponse.json()).resolves.toEqual([
        expect.objectContaining({
          score: 10,
          user_id: userId,
        }),
      ]);

      const teamLeaderboardResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/nova_team_leaderboard?team_id=eq.${teamId}&select=team_id,score`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );

      expect(teamLeaderboardResponse.status()).toBe(200);
      await expect(teamLeaderboardResponse.json()).resolves.toEqual([
        expect.objectContaining({
          score: 10,
          team_id: teamId,
        }),
      ]);

      const updateSubmissionResponse = await request.patch(
        `${SUPABASE_URL}/rest/v1/nova_submissions?id=eq.${submissionId}`,
        {
          data: {
            prompt: 'updated prompt',
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );

      expect(updateSubmissionResponse.status()).toBe(204);
    } finally {
      await request.delete(
        `${SUPABASE_URL}/rest/v1/nova_teams?id=eq.${teamId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );

      await request.delete(
        `${SUPABASE_URL}/rest/v1/nova_challenges?id=eq.${challengeId}`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );
    }
  });
});
