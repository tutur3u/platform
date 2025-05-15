import { google } from '@ai-sdk/google';
import { vertex } from '@ai-sdk/google-vertex/edge';
import type { SafetySetting } from '@google/generative-ai';
import type {
  NovaSubmissionCriteria,
  NovaSubmissionTestCase,
  ResponseMode,
} from '@tuturuuu/ai/types';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { generateObject } from 'ai';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const DEFAULT_MODEL_NAME = 'gemini-1.5-flash-002';

// Add a simple round-robin selection function that favors Google
function getModelProvider() {
  // Use timestamp to create simple round-robin with 70% preference for Google
  // const timestamp = Date.now();
  // return timestamp % 10 < 7 ? 'google' : 'vertex';

  // Always use Google (higher rate limit)
  return 'google';
}

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
    ? getModelProvider() === 'vertex'
      ? vertex(DEFAULT_MODEL_NAME, {
          safetySettings: modelSafetySettings,
        })
      : google(DEFAULT_MODEL_NAME, {
          safetySettings: modelSafetySettings,
        })
    : google(DEFAULT_MODEL_NAME, {
        safetySettings: modelSafetySettings,
      });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ problemId: string }> }
) {
  const supabase = await createClient();
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
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user?.id) {
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

    const { canSubmit, message } = await checkUserPermissions({
      problemId,
      sessionId: sessionId || null,
    });

    if (!canSubmit) {
      return NextResponse.json({ message }, { status: 401 });
    }

    // Add plagiarism detection check against problem description
    const plagiarismSchema = z.object({
      similarity_score: z.number().min(0).max(1),
      is_plagiarism: z.boolean(),
      reasoning: z.string(),
    });

    let plagiarismResults = null;
    try {
      const { object: plagiarismCheck } = await generateObject({
        model: vertexModel,
        schema: plagiarismSchema,
        prompt: `
          Task: Determine if the user's submitted prompt is substantially similar to the problem description, examples, or expected outputs.

          Problem Description: """${problem.description}"""
          Example Input: """${problem.example_input}"""
          Example Output: """${problem.example_output}"""
          User Prompt: """${prompt}"""

          Return a JSON object with:
          - similarity_score: a number between 0 (completely different) and 1 (identical or nearly identical)
          - is_plagiarism: boolean, true if this appears to be a direct copy with minimal modification
          - reasoning: brief explanation of your assessment

          Be lenient in this evaluation - it's acceptable for submissions to incorporate elements from the problem description as long as they add meaningful prompt engineering value. Only flag submissions as plagiarism if they are nearly identical copies with little to no original contribution.
          `,
        temperature: 0.1,
      });

      plagiarismResults = plagiarismCheck;
      console.log('Plagiarism check results:', plagiarismResults);
    } catch (error) {
      console.error('Error during plagiarism check:', error);
      // Continue with evaluation even if plagiarism check fails
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
      testCaseInputs: testCases.map((testCase) => ({
        id: testCase.id,
        input: testCase.input,
      })),
      criteria: challengeCriteria.map((criteria) => ({
        name: criteria.name,
        description: criteria.description,
      })),
      userPrompt: prompt,
      plagiarismCheck: plagiarismResults,
    };

    const testCaseSchema = z.object({
      matched: z
        .boolean()
        .describe(
          'True if the model output is semantically equivalent to the expected answer'
        ),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .describe('Confidence level in the match assessment (0-1)'),
      reasoning: z
        .string()
        .describe("Brief explanation of why outputs match or don't match"),
    });

    const EvaluationSchema = z.object({
      testCaseEvaluation: z
        .array(
          z.object({
            id: z
              .string()
              .describe(
                'The ID of the original test case from the context (DO NOT HALLUCINATE)'
              ),
            input: z.string().describe('The input for the test case'),
            output: z.string().describe('The output for the test case'),
            reasoning: z
              .string()
              .optional()
              .describe('Optional reasoning for this output'),
          })
        )
        .describe('Array of test case evaluations'),
      criteriaEvaluation: z
        .array(
          z.object({
            name: z.string().describe('Name of the evaluation criterion'),
            description: z.string().describe('Description of the criterion'),
            score: z.number().min(0).max(10).describe('Score out of 10'),
            feedback: z
              .string()
              .describe(
                'Detailed feedback for the criterion with specific examples'
              ),
            strengths: z
              .array(z.string())
              .describe('Key strengths related to this criterion'),
            improvements: z
              .array(z.string())
              .describe(
                'Suggestions for improvement related to this criterion'
              ),
          })
        )
        .describe('Array of criteria evaluations'),
      overallAssessment: z
        .string()
        .describe('A brief overall assessment of the submission'),
      totalScore: z
        .number()
        .describe('The calculated total score across all criteria'),
    });

    const systemInstruction = `
      # Prompt Engineering Evaluation System

      You are an expert evaluator in a prompt engineering competition. Your task is to accurately and objectively assess submissions based on predefined criteria.

      ## Input Information
      You will receive:
      - Problem title and description (may be in any language)
      - Example input/output pairs (may be in any language)
      - Test case inputs
      - Evaluation criteria
      - User's submitted prompt/solution (may be in any language)

      ## Your Evaluation Process
      Follow this systematic approach:

      1. **Analyze the Problem**: Thoroughly understand the problem requirements regardless of language
        - Identify core objectives and constraints
        - Note any edge cases or special considerations

      2. **Similarity Consideration**: Be aware that for short or straightforward problems, similarity to the problem description is expected
        - Do NOT penalize users for necessary inclusion of problem elements
        - Focus on evaluating the effectiveness of the prompt rather than its originality
        - Only consider similarity problematic if the submission adds no instructional value

      3. **Process Test Cases**: For each test case:
        - Apply the user's prompt/solution to generate an appropriate output
        - Document your reasoning process
        - Record both the generated output and your reasoning
        - IMPORTANT: Evaluate whether the prompt effectively guides an AI to produce correct outputs

      4. **Evaluate Against Criteria**: For each criterion:
        - Assess how effectively the submission addresses the specific criterion
        - Provide a score from 0-10 (decimal values allowed)
        - Give detailed feedback with specific examples from the submission
        - Identify key strengths and suggest specific improvements
        - Ensure the prompt provides useful guidance for generating correct outputs

      5. **Multi-language Considerations**:
        - Evaluate the solution's effectiveness regardless of language
        - Focus on functionality and approach, not linguistic elements
        - Consider cultural/regional context when relevant

      ## Scoring Guidelines

      | Score | Description |
      |-------|-------------|
      | 9-10  | Exceptional: The submission demonstrates masterful understanding and execution, with innovative approaches that effectively address all aspects of the problem. The solution is elegant, efficient, and shows deep insight. |
      | 7-8.9 | Strong: The submission shows strong understanding and good execution with minor limitations. Most aspects are well-addressed with only small inefficiencies or missed optimizations. |
      | 5-6.9 | Adequate: The submission demonstrates basic understanding with some effective elements but has notable limitations or inefficiencies. Core requirements are met, but implementation could be significantly improved. |
      | 3-4.9 | Limited: The submission shows partial understanding but has significant gaps, errors, or inefficient approaches. It addresses some aspects but misses key components. |
      | 1-2.9 | Minimal: The submission attempts to address the problem but is mostly incorrect or ineffective. Major misconceptions or fundamental errors are present. |
      | 0-0.9 | Insufficient: The submission is entirely off-topic, irrelevant, or simply restates the problem without providing any solution approach. |

      ## Output Format Requirements
      - Structure your evaluation according to the JSON schema provided
      - Provide specific, actionable feedback for each criterion
      - Ensure scores align with the detailed rubric above
      - CRITICAL: Return ONLY a valid JSON object without any markdown formatting or additional text

      Here is the problem context:
      ${JSON.stringify(ctx)}
    `;

    let evaluation;

    try {
      const { object } = await generateObject({
        model: vertexModel,
        schema: EvaluationSchema,
        prompt,
        system: systemInstruction,
      });

      evaluation = object;
    } catch (error) {
      console.error('AI evaluation error:', error);
      return NextResponse.json(
        { message: 'Failed to evaluate prompt' },
        { status: 500 }
      );
    }

    // Step 3: Create the submission record
    const { data: submission, error: submissionError } = await sbAdmin
      .from('nova_submissions')
      .insert({
        prompt,
        problem_id: problemId,
        session_id: sessionId,
        user_id: user.id,
        overall_assessment: evaluation.overallAssessment,
      })
      .select('id')
      .single();

    if (submissionError) {
      console.error('Submission error:', submissionError);
      return NextResponse.json(
        { message: 'Failed to create submission record' },
        { status: 500 }
      );
    }

    submissionId = submission.id;

    // Step 4: Save test case results
    const testCaseEvaluation = evaluation.testCaseEvaluation || [];
    const testCaseInserts: Array<
      NovaSubmissionTestCase & {
        confidence?: number;
        reasoning?: string;
      }
    > = [];

    for (const testCase of testCaseEvaluation) {
      const matchingTestCase = testCases.find((tc) => tc.id === testCase.id);
      if (matchingTestCase) {
        console.log(
          `Evaluating test case - Input: ${testCase.input}, AI Output: ${testCase.output}, Expected: ${matchingTestCase.output}`
        );

        // --- Enhanced LLM-based evaluation ---
        const evaluationPrompt = `
          # Output Evaluation Task

          You are tasked with evaluating whether a language model's output matches the expected output for a prompt engineering problem. This evaluation is critical for determining the effectiveness of a user's prompt.

          ## Context
          - **Problem Description**: """${problem.description}"""
          - **Input**: """${testCase.input}"""
          - **Expected Output**: """${matchingTestCase.output}"""
          - **Model Output**: """${testCase.output}"""
          - **User's Prompt that generated this output**: """${prompt}"""

          ## Evaluation Instructions

          1. **Semantic Equivalence Analysis**:
            - Determine if the outputs convey the same meaning and fulfill the same function
            - Consider paraphrasing, synonyms, formatting differences, and alternative expressions
            - Account for valid variations in style, tone, or presentation
            - For numerical outputs, check mathematical equivalence rather than exact format

          2. **Contextual Appropriateness**:
            - Assess if both outputs satisfy the requirements specified in the problem description
            - Consider whether differences affect functionality or are merely stylistic
            - Verify that the output provides a correct solution to the specific input

          3. **Language Considerations**:
            - If outputs are in different languages, focus on whether they convey equivalent information
            - Account for cultural or linguistic variations in expression

          4. **Strictness of Evaluation**:
            - Be strict with correctness - the model output must correctly address the input
            - Minor formatting differences are acceptable, but logical/functional correctness is essential
            - Focus particularly on whether the user's prompt effectively guided the AI to generate the correct output

          5. **Prompt Effectiveness Analysis**:
            - Consider whether the user's prompt effectively guided the model to produce a correct output
            - Look for clear, specific instructions in the prompt that helped the model understand what was needed
            - Note if the prompt fails to provide sufficient guidance or merely copies problem information

          ## Decision Framework
          - **Match (true)**: Outputs are functionally equivalent and correctly solve the problem
          - **No Match (false)**: Outputs differ in meaningful ways that affect their function, accuracy or correctness

          ## Required Response Format
          Provide your evaluation as a JSON object with three fields:
          - **matched**: boolean (true/false) indicating semantic equivalence
          - **confidence**: number (0-1) indicating your confidence level
          - **reasoning**: brief explanation of your assessment, including specific differences if not matched

          Focus on objective assessment rather than subjective judgment.
        `;

        let isMatch = false;
        let confidence = 0;
        let reasoning = '';

        try {
          const { object } = await generateObject({
            model: vertexModel,
            schema: testCaseSchema,
            prompt: evaluationPrompt,
          });

          isMatch = object.matched;
          confidence = object.confidence || 0;
          reasoning = object.reasoning || '';

          testCaseInserts.push({
            submission_id: submissionId,
            test_case_id: matchingTestCase.id,
            output: testCase.output,
            matched: isMatch,
            confidence,
            reasoning,
          });
        } catch (error) {
          console.error('Error evaluating test case with LLM:', error);
          isMatch = false;
        }
      }
    }

    if (testCaseInserts.length > 0) {
      try {
        const { error: testCaseInsertsError } = await sbAdmin
          .from('nova_submission_test_cases')
          .insert(
            testCaseInserts.map(
              ({
                submission_id,
                test_case_id,
                output,
                matched,
                confidence,
                reasoning,
              }) => ({
                submission_id,
                test_case_id,
                output,
                matched,
                confidence,
                reasoning,
              })
            )
          );

        if (testCaseInsertsError) {
          console.error('Error inserting test cases:', testCaseInsertsError);
        }
      } catch (error) {
        console.error('Failed to create test case results:', error);
      }
    }

    // Step 5: Save criteria evaluations
    const criteriaEvaluation = evaluation.criteriaEvaluation || [];
    const criteriaInserts: Array<
      NovaSubmissionCriteria & {
        strengths?: string[];
        improvements?: string[];
      }
    > = [];

    for (const criteriaEval of criteriaEvaluation) {
      const matchingCriteria = challengeCriteria.find(
        (c) => c.name === criteriaEval.name
      );
      if (matchingCriteria) {
        criteriaInserts.push({
          submission_id: submissionId,
          criteria_id: matchingCriteria.id,
          score: criteriaEval.score,
          feedback: criteriaEval.feedback,
          strengths: criteriaEval.strengths || [],
          improvements: criteriaEval.improvements || [],
        });
      }
    }

    if (criteriaInserts.length > 0) {
      try {
        const { error: criteriaInsertsError } = await sbAdmin
          .from('nova_submission_criteria')
          .insert(
            criteriaInserts.map(
              ({
                submission_id,
                criteria_id,
                score,
                feedback,
                strengths,
                improvements,
              }) => ({
                submission_id,
                criteria_id,
                score,
                feedback,
                strengths,
                improvements,
              })
            )
          );

        if (criteriaInsertsError) {
          console.error('Error inserting criteria:', criteriaInsertsError);
        }
      } catch (error) {
        console.error('Failed to create criteria evaluations:', error);
      }
    }

    // Step 6: Return the evaluation results and submission ID
    return NextResponse.json(
      {
        submissionId: submissionId,
        response: evaluation,
        matchedTestCases: testCaseInserts.filter((tc) => tc.matched).length,
        totalTestCases: testCaseInserts.length,
      },
      { status: 200 }
    );
  } catch (error: any) {
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
      { message: `Internal server error: ${error.message}` },
      { status: 500 }
    );
  }
}

async function checkUserPermissions({
  problemId,
  sessionId,
}: {
  problemId: string;
  sessionId: string | null;
}) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id || !user?.email) {
    return {
      canSubmit: false,
      remainingAttempts: 0,
      message: 'Unauthorized',
    };
  }

  // Check if the user is an admin
  const { data: roleData, error: roleError } = await supabase
    .from('nova_roles')
    .select('*')
    .eq('email', user.email)
    .eq('allow_challenge_management', true)
    .single();

  if (roleError && roleError.code !== 'PGRST116') {
    console.error('Database Error when checking role:', roleError);
    return {
      canSubmit: false,
      remainingAttempts: 0,
      message: 'Error checking user permissions',
    };
  }

  const isAdmin = roleData && roleData.allow_challenge_management;

  // Admin users can always submit without restrictions
  if (isAdmin) {
    return { canSubmit: true, remainingAttempts: -1, message: null };
  }

  // For non-admin users, validate session and submission count
  if (!sessionId) {
    return {
      canSubmit: false,
      remainingAttempts: 0,
      message: 'sessionId is required for non-admin users',
    };
  }

  // Check if the session is in progress
  const { data: sessionData, error: sessionError } = await supabase
    .from('nova_sessions')
    .select('*, ...nova_challenges!inner(duration, close_at)')
    .eq('id', sessionId)
    .single();

  if (sessionError) {
    console.error('Database Error when checking session:', sessionError);
    return {
      canSubmit: false,
      remainingAttempts: 0,
      message: 'Error fetching session data',
    };
  }

  const sessionEndTime = Math.min(
    sessionData.close_at ? new Date(sessionData.close_at).getTime() : Infinity,
    new Date(sessionData.start_time).getTime() + sessionData.duration * 1000
  );

  const currentTime = new Date().getTime();

  if (currentTime > sessionEndTime) {
    return {
      canSubmit: false,
      remainingAttempts: 0,
      message: 'Session has ended',
    };
  }

  // Check submission count
  const { error: countError, count } = await supabase
    .from('nova_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('problem_id', problemId)
    .eq('session_id', sessionId)
    .eq('user_id', user.id);

  if (countError) {
    console.error('Database Error when counting submissions:', countError);
    return {
      canSubmit: false,
      remainingAttempts: 0,
      message: 'Error checking submission count',
    };
  }

  const maxAttempts = 3;
  const submissionCount = count || 0;
  const remainingAttempts = maxAttempts - submissionCount;

  if (submissionCount >= maxAttempts) {
    return {
      canSubmit: false,
      remainingAttempts: 0,
      message: 'You have reached the maximum of 3 submissions.',
    };
  }

  return {
    canSubmit: true,
    remainingAttempts,
    message: null,
  };
}
