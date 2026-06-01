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

test.describe('Nova challenge catalog private schema API', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('manages challenge, problem, and test-case rows through private REST only', async ({
    request,
  }) => {
    const challengeId = randomUUID();
    const criterionId = randomUUID();
    const problemId = randomUUID();
    const testCaseId = randomUUID();
    const submissionId = randomUUID();
    const challengeTitle = `Private Nova challenge ${Date.now()}`;

    try {
      const createChallengeResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/nova_challenges`,
        {
          data: {
            description: 'Created by private schema E2E coverage',
            duration: 3600,
            id: challengeId,
            title: challengeTitle,
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
            description: 'Validate correctness',
            id: criterionId,
            name: 'Correctness',
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
            description: 'Created by private schema E2E coverage',
            example_input: 'input',
            example_output: 'output',
            id: problemId,
            max_prompt_length: 512,
            title: 'Private Nova problem',
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );

      expect(createProblemResponse.status()).toBe(201);

      const createTestCaseResponse = await request.post(
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

      expect(createTestCaseResponse.status()).toBe(201);

      const createSubmissionResponse = await request.post(
        `${SUPABASE_URL}/rest/v1/nova_submissions`,
        {
          data: {
            id: submissionId,
            problem_id: problemId,
            prompt: 'solve it',
            user_id: '00000000-0000-0000-0000-000000000001',
          },
          failOnStatusCode: false,
          headers: serviceHeaders({
            prefer: 'return=minimal',
          }),
        }
      );

      expect(createSubmissionResponse.status()).toBe(201);

      const createSubmissionTestResponse = await request.post(
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

      expect(createSubmissionTestResponse.status()).toBe(201);

      const readResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/nova_challenges?id=eq.${challengeId}&select=id,title`,
        {
          failOnStatusCode: false,
          headers: serviceHeaders(),
        }
      );

      expect(readResponse.status()).toBe(200);
      await expect(readResponse.json()).resolves.toEqual([
        expect.objectContaining({
          id: challengeId,
          title: challengeTitle,
        }),
      ]);

      const updateTestCaseResponse = await request.patch(
        `${SUPABASE_URL}/rest/v1/nova_problem_test_cases?id=eq.${testCaseId}`,
        {
          data: {
            hidden: true,
          },
          failOnStatusCode: false,
          headers: serviceHeaders({ prefer: 'return=minimal' }),
        }
      );

      expect(updateTestCaseResponse.status()).toBe(204);
    } finally {
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
