import { google } from '@ai-sdk/google';
import { vertex } from '@ai-sdk/google-vertex/edge';
import type { SafetySetting } from '@google/generative-ai';
import type { ResponseMode } from '@tuturuuu/ai/types';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { generateText } from 'ai';
import { type NextRequest, NextResponse } from 'next/server';

const DEFAULT_MODEL_NAME = 'gemini-1.5-flash-002';

export const runtime = 'edge';
export const maxDuration = 60;
export const preferredRegion = 'sin1';

const modelSafetySettings = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  {
    category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    threshold: 'BLOCK_NONE',
  },
  {
    category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
    threshold: 'BLOCK_NONE',
  },
] as SafetySetting[];

const vertexModel =
  process.env.NODE_ENV === 'production'
    ? vertex(DEFAULT_MODEL_NAME, {
        safetySettings: modelSafetySettings,
      })
    : google(DEFAULT_MODEL_NAME, {
        safetySettings: modelSafetySettings,
      });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ problemId: string }> }
) {
  const supabase = createClient();
  const sbAdmin = await createAdminClient();

  let submissionId: string | null = null;

  try {
    const { prompt, sessionId } = (await req.json()) as {
      id?: string;
      model?: string;
      prompt?: string;
      sessionId?: string;
      mode?: ResponseMode;
    };

    const {
      data: { user },
    } = await (await supabase).auth.getUser();

    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    if (!prompt) {
      return NextResponse.json(
        { message: 'Incomplete data provided' },
        { status: 400 }
      );
    }

    const { problemId } = await params;

    if (!problemId) {
      return NextResponse.json(
        { message: 'Incomplete data provided' },
        { status: 400 }
      );
    }

    const { data: problem, error: problemError } = await sbAdmin
      .from('nova_problems')
      .select('*')
      .eq('id', problemId)
      .single();

    if (problemError) {
      return NextResponse.json(
        { message: 'Error fetching problem' },
        { status: 500 }
      );
    }

    if (prompt.length > problem.max_prompt_length) {
      return NextResponse.json(
        { message: 'Prompt is too long' },
        { status: 400 }
      );
    }

    const { data: testCases, error: testCaseError } = await sbAdmin
      .from('nova_problem_test_cases')
      .select('*')
      .eq('problem_id', problemId);

    if (testCaseError) {
      return NextResponse.json(
        { message: 'Error fetching test cases' },
        { status: 500 }
      );
    }

    const { data: challengeCriteria, error: challengeCriteriaError } =
      await sbAdmin
        .from('nova_challenge_criteria')
        .select('*')
        .eq('challenge_id', problem.challenge_id);

    if (challengeCriteriaError) {
      return NextResponse.json(
        { message: 'Error fetching challenge criteria' },
        { status: 500 }
      );
    }

    // Step 1: Evaluate the prompt with the AI model
    const ctx = {
      title: problem.title,
      description: problem.description,
      exampleInput: problem.example_input,
      exampleOutput: problem.example_output,
      testCaseInputs: testCases.map((testCase) => testCase.input),
      criteria: challengeCriteria.map((criteria) => ({
        name: criteria.name,
        description: criteria.description,
      })),
      userPrompt: prompt,
    };

    const exampleResponse = {
      testCaseEvaluation: [
        {
          input: '<test case input>',
          output: '<your test case output>',
        },
      ],
      criteriaEvaluation: [
        {
          name: '<criteria name>',
          description: '<criteria description>',
          score: 10,
          feedback: '<feedback>',
        },
      ],
    };

    // System Instruction for Evaluation with strict JSON output
    const systemInstruction = `
      You are an examiner in a prompt engineering competition.
      You will be provided with:
      - A problem title and description
      - An example input/output
      - Test cases inputs (optional)
      - Criteria
      - A user's answer or prompt that attempts to solve the problem
      Your role is to:
      1. **Attempt** to apply the user's response to each provided test case (if the response is executable or can be logically applied).
      2. **Evaluate** how effectively the user's response addresses the problem.
      3. **Return** both your results for each test case and the criteria evaluation in a specific JSON format.
      Here is the problem context:
      ${JSON.stringify(ctx)}
      Scoring Criteria:
      - **10**: The user's response perfectly solves the problem or provides a clear and effective prompt that would solve the problem.
      - **7-9**: The response mostly solves the problem or gives a good prompt but with minor inefficiencies or missing details.
      - **4-6**: The response shows some understanding but has notable errors, incomplete results, or inefficient approaches.
      - **1-3**: The response attempts to address the problem but is mostly incorrect, irrelevant, or incomplete.
      - **0**: The response is entirely irrelevant or simply repeats the problem description without guiding towards a solution.
      Important Notes:
      1. **If the user's response is an effective prompt** that guides solving the problem (e.g., "Summarize the paragraph in just one sentence"), it should be **scored based on how well it would solve the task**.
      2. Only assign **0** if the response does not attempt to solve the problem or is irrelevant.
      3. Ensure the feedback clearly explains why the score was assigned, focusing on how well the response addresses each criterion.
      4. CRITICAL: You MUST respond with ONLY a valid, properly formatted JSON object without any markdown formatting or code blocks.
      5. The score MUST be from 0 to 10, can be in decimal.
      6. The response MUST use this EXACT format:
      ${JSON.stringify(exampleResponse)}
    `;

    const res = await generateText({
      model: vertexModel,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt },
      ],
    });
    const response = res.steps[0]?.text;

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(
        (response ?? '').replace(/```json\n|\n```/g, '').trim()
      );
    } catch (parseError) {
      console.error('Parse error:', parseError);
      return NextResponse.json(
        {
          message:
            'Invalid response format. Expected JSON with testCaseEvaluation and criteriaEvaluation.',
        },
        { status: 422 }
      );
    }

    // Step 2: Create the submission record
    const { data: submission, error: submissionError } = await sbAdmin
      .from('nova_submissions')
      .insert({
        prompt,
        problem_id: problemId,
        session_id: sessionId,
        user_id: user.id,
      })
      .select('id')
      .single();

    if (submissionError) {
      return NextResponse.json(
        { message: 'Failed to create submission record' },
        { status: 500 }
      );
    }

    submissionId = submission.id;

    // Step 3: Save test case results
    const testCaseEvaluation = parsedResponse.testCaseEvaluation || [];
    const testCaseInserts = testCaseEvaluation
      .map((testCase: any) => {
        // Find matching test case in the problem
        const matchingTestCase = testCases.find(
          (tc) => tc.input === testCase.input
        );

        if (matchingTestCase) {
          return {
            submission_id: submission.id,
            test_case_id: matchingTestCase.id,
            output: testCase.output,
            matched: matchingTestCase.output === testCase.output,
          };
        }
        return null;
      })
      .filter(Boolean);

    if (testCaseInserts.length > 0) {
      const { error: testCaseInsertsError } = await sbAdmin
        .from('nova_submission_test_cases')
        .insert(testCaseInserts);

      if (testCaseInsertsError) {
        throw new Error('Failed to create test case results');
      }
    }

    // Step 4: Save criteria evaluations
    const criteriaEvaluation = parsedResponse.criteriaEvaluation || [];
    const criteriaInserts = criteriaEvaluation
      .map((criteriaEval: any) => {
        // Find matching criteria by name
        const matchingCriteria = challengeCriteria.find(
          (c) => c.name === criteriaEval.name
        );

        if (matchingCriteria) {
          return {
            submission_id: submission.id,
            criteria_id: matchingCriteria.id,
            score: criteriaEval.score,
            feedback: criteriaEval.feedback,
          };
        }
        return null;
      })
      .filter(Boolean);

    if (criteriaInserts.length > 0) {
      const { error: criteriaInsertsError } = await sbAdmin
        .from('nova_submission_criteria')
        .insert(criteriaInserts);

      if (criteriaInsertsError) {
        throw new Error('Failed to create criteria evaluations');
      }
    }

    // Return the evaluation results and submission ID
    return NextResponse.json(
      { submissionId: submission.id, response: parsedResponse },
      { status: 200 }
    );
  } catch (error) {
    console.error('🚨 Server error:', error);

    // Delete the submission if it was created
    if (submissionId) {
      try {
        await sbAdmin.from('nova_submissions').delete().eq('id', submissionId);
      } catch (deleteError) {
        console.error('Failed to delete submission:', deleteError);
      }
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
