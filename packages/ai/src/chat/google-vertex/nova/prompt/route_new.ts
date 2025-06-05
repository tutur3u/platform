import {
  MAIN_EVALUATION_PROMPT,
  OUTPUT_COMPARISON_PROMPT,
  PLAGIARISM_DETECTION_PROMPT,
  TEST_CASE_EVALUATION_PROMPT,
} from './prompts';
import { google } from '@ai-sdk/google';
import type { SafetySetting } from '@google/generative-ai';
import type {
  NovaSubmissionCriteria,
  NovaSubmissionTestCase,
} from '@tuturuuu/ai/types';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NovaProblem } from '@tuturuuu/types/db';
import { checkPermission } from '@tuturuuu/utils/nova/submissions/check-permission';
import { generateObject } from 'ai';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

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

// Initialize model with appropriate provider
const critizierModel = google('gemini-2.0-flash', {
  safetySettings: modelSafetySettings,
});

const evaluatorModel = google('gemini-2.0-flash-lite', {
  safetySettings: modelSafetySettings,
});

// Schema definitions
const PlagiarismSchema = z.object({
  similarity_score: z.number().min(0).max(1),
  is_plagiarism: z.boolean(),
  reasoning: z.string(),
});

const CriteriaEvaluationSchema = z.object({
  criteriaEvaluation: z
    .array(
      z.object({
        id: z
          .string()
          .describe('ID of the evaluation criterion from the context'),
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
          .describe('Suggestions for improvement related to this criterion'),
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

const TestCaseEvaluationSchema = z
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
        .max(2000)
        .optional()
        .describe(
          'Optional reasoning for this output, the reasoning is at most 2000 characters.'
        ),
    })
  )
  .describe('Array of test case evaluations');

// Define the type that includes both evaluation types
type CombinedEvaluation = z.infer<typeof CriteriaEvaluationSchema> & {
  testCaseEvaluation?: z.infer<typeof TestCaseEvaluationSchema>;
};

const TestCaseCheckSchema = z.object({
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

// API route handler - Streaming version
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ problemId: string }> }
) {
  const supabase = await createClient();
  const sbAdmin = await createAdminClient();

  try {
    // Parse request data
    const { prompt, sessionId, stream = false } = (await req.json()) as {
      id?: string;
      model?: string;
      prompt?: string;
      sessionId?: string;
      stream?: boolean;
    };

    // Authenticate user
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

    // Fetch problem details
    const { data: problem, error: problemError } =
      await fetchProblem(problemId);

    if (problemError || !problem) {
      return NextResponse.json(
        { message: 'Error fetching problem' },
        { status: 500 }
      );
    }

    // Validate prompt length
    if (prompt.length > problem.max_prompt_length) {
      return NextResponse.json(
        { message: 'Prompt is too long' },
        { status: 400 }
      );
    }

    // Check submission permissions
    const { canSubmit, message } = await checkPermission({
      problemId,
      sessionId: sessionId || null,
    });

    if (!canSubmit) {
      return NextResponse.json({ message }, { status: 401 });
    }

    // If streaming is requested, use streamObject
    if (stream) {
      return streamEvaluation({
        problem,
        prompt,
        sessionId,
        userId: user.id,
        problemId,
      });
    }

    // Otherwise, use the original non-streaming implementation
    return await originalEvaluation({
      problem,
      prompt,
      sessionId,
      userId: user.id,
      problemId,
      sbAdmin,
    });

  } catch (error: any) {
    console.error('🚨 Server error:', error);
    return NextResponse.json(
      { message: `Internal server error: ${error.message}` },
      { status: 500 }
    );
  }
}

// New streaming evaluation function
async function streamEvaluation({
  problem,
  prompt,
  sessionId,
  userId,
  problemId,
}: {
  problem: any;
  prompt: string;
  sessionId?: string;
  userId: string;
  problemId: string;
}) {
  // Create a custom streaming response that performs actual evaluation
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      const sbAdmin = await createAdminClient();
      let submissionId: string | null = null;
      
      try {
        // Send initial progress
        const sendProgress = (stage: string, progress: number, message: string, data?: any) => {
          const progressData = {
            stage,
            progress,
            message,
            current_step: message,
            ...data,
          };
          controller.enqueue(encoder.encode(`0:${JSON.stringify(progressData)}\n`));
        };

        // Stage 1: Plagiarism Check (0-20%)
        sendProgress('plagiarism', 5, 'Starting plagiarism detection...');
        
        const plagiarismResults = await checkPlagiarism(problem, prompt);
        
        sendProgress('plagiarism', 20, 'Plagiarism check completed', {
          plagiarism_check: plagiarismResults,
        });

        // Fetch test cases and challenge criteria
        const { testCases, challengeCriteria } = await fetchTestCasesAndCriteria(problem);

        // Build evaluation context
        const ctx = buildEvaluationContext(
          problem,
          testCases,
          challengeCriteria,
          prompt,
          plagiarismResults
        );

        // Stage 2: Criteria Evaluation (20-60%)
        sendProgress('criteria', 25, 'Starting criteria evaluation...');
        
        let evaluation: CombinedEvaluation = {
          criteriaEvaluation: [],
          overallAssessment: 'No evaluation performed (no criteria available)',
          totalScore: 0,
          testCaseEvaluation: [],
        };

        if (challengeCriteria && challengeCriteria.length > 0) {
          sendProgress('criteria', 30, `Evaluating against ${challengeCriteria.length} criteria...`);
          evaluation = await performCriteriaEvaluation(ctx);
          sendProgress('criteria', 60, 'Criteria evaluation completed', {
            criteria_evaluation: evaluation,
          });
        } else {
          sendProgress('criteria', 60, 'No criteria found, skipping evaluation');
        }

        // Stage 3: Create submission record
        sendProgress('saving', 65, 'Creating submission record...');
        
        const submission = await createSubmissionRecord(
          prompt,
          problemId,
          sessionId,
          userId,
          evaluation.overallAssessment
        );

        if (!submission) {
          throw new Error('Failed to create submission record');
        }

        submissionId = submission.id;
        sendProgress('saving', 70, 'Submission record created', {
          submission_id: submissionId,
        });

        // Stage 4: Test Case Evaluation (70-85%)
        let testCaseInserts: Array<NovaSubmissionTestCase & {
          confidence?: number;
          reasoning?: string;
        }> = [];

        if (testCases && testCases.length > 0) {
          sendProgress('test_cases', 75, `Running ${testCases.length} test cases...`);
          
          const testCaseEvaluation = await performTestCaseEvaluation(ctx);
          evaluation.testCaseEvaluation = testCaseEvaluation;

          sendProgress('test_cases', 80, 'Processing test case results...');
          
          testCaseInserts = await processTestCaseResults(
            testCaseEvaluation,
            testCases,
            problem,
            prompt,
            submissionId
          );

          await saveTestCaseResults(testCaseInserts);
          
          sendProgress('test_cases', 85, 'Test case evaluation completed', {
            test_case_evaluation: testCaseEvaluation,
          });
        } else {
          sendProgress('test_cases', 85, 'No test cases found, skipping evaluation');
        }

        // Stage 5: Save criteria results (85-95%)
        sendProgress('saving', 90, 'Saving evaluation results...');
        
        if (challengeCriteria && challengeCriteria.length > 0 && evaluation.criteriaEvaluation) {
          const criteriaInserts = processCriteriaEvaluations(
            evaluation.criteriaEvaluation,
            challengeCriteria,
            submissionId
          );
          await saveCriteriaEvaluations(criteriaInserts);
        }

        sendProgress('saving', 95, 'Results saved successfully');

        // Stage 6: Complete (100%)
        sendProgress('complete', 100, 'Evaluation completed successfully', {
          submission_id: submissionId,
          response: evaluation,
          matchedTestCases: testCaseInserts.filter((tc) => tc.matched).length,
          totalTestCases: testCaseInserts.length,
        });

      } catch (error: any) {
        console.error('Streaming evaluation error:', error);
        
        // Clean up submission if created
        if (submissionId) {
          try {
            await sbAdmin.from('nova_submissions').delete().eq('id', submissionId);
          } catch (deleteError) {
            console.error('Failed to delete submission:', deleteError);
          }
        }

        // Send error progress
        const errorData = {
          stage: 'error',
          progress: 0,
          message: 'Evaluation failed',
          error: error.message,
        };
        controller.enqueue(encoder.encode(`0:${JSON.stringify(errorData)}\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    },
  });
}

// Original non-streaming evaluation function (preserved for backward compatibility)
async function originalEvaluation({
  problem,
  prompt,
  sessionId,
  userId,
  problemId,
  sbAdmin,
}: {
  problem: any;
  prompt: string;
  sessionId?: string;
  userId: string;
  problemId: string;
  sbAdmin: any;
}) {
  let submissionId: string | null = null;

  try {
    // Check for plagiarism
    const plagiarismResults = await checkPlagiarism(problem, prompt);

    // Fetch test cases and challenge criteria
    const { testCases, challengeCriteria } =
      await fetchTestCasesAndCriteria(problem);

    // Build evaluation context
    const ctx = buildEvaluationContext(
      problem,
      testCases,
      challengeCriteria,
      prompt,
      plagiarismResults
    );

    // Initialize with empty values
    let evaluation: CombinedEvaluation = {
      criteriaEvaluation: [],
      overallAssessment: 'No evaluation performed (no criteria available)',
      totalScore: 0,
      testCaseEvaluation: [],
    };

    // Step 1: Perform main criteria evaluation only if criteria exist
    if (challengeCriteria && challengeCriteria.length > 0) {
      console.log(
        `Running criteria evaluation with ${challengeCriteria.length} criteria`
      );
      evaluation = await performCriteriaEvaluation(ctx);
    } else {
      console.log('Skipping criteria evaluation - no criteria found');
    }

    // Step 2: Create submission record
    const submission = await createSubmissionRecord(
      prompt,
      problemId,
      sessionId,
      userId,
      evaluation.overallAssessment
    );

    if (!submission) {
      return NextResponse.json(
        { message: 'Failed to create submission record' },
        { status: 500 }
      );
    }

    submissionId = submission.id;

    let testCaseInserts: Array<
      NovaSubmissionTestCase & {
        confidence?: number;
        reasoning?: string;
      }
    > = [];

    // Step 3: Perform test case evaluation only if test cases exist
    if (testCases && testCases.length > 0) {
      console.log(
        `Running test case evaluation with ${testCases.length} test cases`
      );
      const testCaseEvaluation = await performTestCaseEvaluation(ctx);
      evaluation.testCaseEvaluation = testCaseEvaluation;

      // Step 4: Process and save test case results
      testCaseInserts = await processTestCaseResults(
        testCaseEvaluation,
        testCases,
        problem,
        prompt,
        submissionId
      );

      await saveTestCaseResults(testCaseInserts);
    } else {
      console.log('Skipping test case evaluation - no test cases found');
    }

    let criteriaInserts: Array<
      NovaSubmissionCriteria & {
        strengths?: string[];
        improvements?: string[];
      }
    > = [];

    // Step 5: Save criteria evaluations only if criteria exist
    if (
      challengeCriteria &&
      challengeCriteria.length > 0 &&
      evaluation.criteriaEvaluation
    ) {
      criteriaInserts = processCriteriaEvaluations(
        evaluation.criteriaEvaluation,
        challengeCriteria,
        submissionId
      );

      await saveCriteriaEvaluations(criteriaInserts);
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

    // Clean up the submission if it was created but processing failed
    if (submissionId) {
      try {
        await sbAdmin.from('nova_submissions').delete().eq('id', submissionId);
      } catch (deleteError) {
        console.error('Failed to delete submission:', deleteError);
      }
    }

    throw error;
  }
}

// Helper functions

async function fetchProblem(problemId: string) {
  const sbAdmin = await createAdminClient();

  return await sbAdmin
    .from('nova_problems')
    .select('*')
    .eq('id', problemId)
    .single();
}

async function checkPlagiarism(problem: NovaProblem, prompt: string) {
  try {
    const plagiarismPrompt = PLAGIARISM_DETECTION_PROMPT.replace(
      '{{problem_description}}',
      problem.description
    )
      .replace('{{example_input}}', problem.example_input)
      .replace('{{example_output}}', problem.example_output)
      .replace('{{user_prompt}}', prompt);

    const { object: plagiarismCheck } = await generateObject({
      model: critizierModel,
      schema: PlagiarismSchema,
      prompt: plagiarismPrompt,
      temperature: 0.1,
    });

    console.log('Plagiarism check results:', plagiarismCheck);
    return plagiarismCheck;
  } catch (error) {
    console.error('Error during plagiarism check:', error);
    // Return null to continue with evaluation even if plagiarism check fails
    return null;
  }
}

async function fetchTestCasesAndCriteria(problem: NovaProblem) {
  const sbAdmin = await createAdminClient();

  const { data: testCases, error: testCaseError } = await sbAdmin
    .from('nova_problem_test_cases')
    .select('*')
    .eq('problem_id', problem.id);

  if (testCaseError) {
    throw new Error(`Failed to fetch test cases: ${testCaseError.message}`);
  }

  const { data: challengeCriteria, error: challengeCriteriaError } =
    await sbAdmin
      .from('nova_challenge_criteria')
      .select('*')
      .eq('challenge_id', problem.challenge_id);

  if (challengeCriteriaError) {
    throw new Error(
      `Failed to fetch challenge criteria: ${challengeCriteriaError.message}`
    );
  }

  return { testCases, challengeCriteria };
}

function buildEvaluationContext(
  problem: any,
  testCases: any[],
  challengeCriteria: any[],
  prompt: string,
  plagiarismResults: any
) {
  return {
    title: problem.title,
    description: problem.description,
    exampleInput: problem.example_input,
    exampleOutput: problem.example_output,
    testCaseInputs: testCases.map((testCase) => ({
      id: testCase.id,
      input: testCase.input,
    })),
    criteria: challengeCriteria.map((criteria) => ({
      id: criteria.id,
      name: criteria.name,
      description: criteria.description,
    })),
    userPrompt: prompt,
    plagiarismCheck: plagiarismResults,
  };
}

async function performCriteriaEvaluation(
  ctx: any
): Promise<CombinedEvaluation> {
  try {
    const systemInstruction = MAIN_EVALUATION_PROMPT.replace(
      '{{context}}',
      JSON.stringify(ctx)
    );

    const { object } = await generateObject({
      model: critizierModel,
      schema: CriteriaEvaluationSchema,
      prompt: ctx.userPrompt,
      system: systemInstruction,
    });

    // Validate that all criteria evaluations have valid IDs
    if (object.criteriaEvaluation) {
      const criteriaIdsInContext = new Set(ctx.criteria.map((c: any) => c.id));
      const missingIds = object.criteriaEvaluation.filter(
        (ce: any) => !criteriaIdsInContext.has(ce.id)
      );

      if (missingIds.length > 0) {
        console.warn(
          `Found ${missingIds.length} criteria evaluations with IDs not in the context`
        );
      }
    }

    return object;
  } catch (error) {
    console.error('AI criteria evaluation error:', error);
    throw new Error('Failed to evaluate prompt criteria');
  }
}

async function createSubmissionRecord(
  prompt: string,
  problemId: string,
  sessionId: string | undefined,
  userId: string,
  overallAssessment: string
) {
  try {
    const sbAdmin = await createAdminClient();

    const { data: submission, error: submissionError } = await sbAdmin
      .from('nova_submissions')
      .insert({
        prompt,
        problem_id: problemId,
        session_id: sessionId || null,
        user_id: userId,
        overall_assessment: overallAssessment,
      })
      .select('id')
      .single();

    if (submissionError) {
      console.error('Submission error:', submissionError);
      throw new Error('Failed to create submission record');
    }

    return submission;
  } catch (error) {
    console.error('Error creating submission record:', error);
    throw error;
  }
}

async function performTestCaseEvaluation(ctx: any) {
  try {
    const testCaseInstruction = TEST_CASE_EVALUATION_PROMPT.replace(
      '{{context}}',
      JSON.stringify(ctx)
    );

    const { object } = await generateObject({
      model: evaluatorModel,
      schema: TestCaseEvaluationSchema,
      prompt: ctx.userPrompt,
      system: testCaseInstruction,
    });

    // Validate that all test case evaluations have valid IDs
    if (object && Array.isArray(object)) {
      const testCaseIdsInContext = new Set(
        ctx.testCaseInputs.map((tc: any) => tc.id)
      );
      const missingIds = object.filter(
        (tc: any) => !testCaseIdsInContext.has(tc.id)
      );

      if (missingIds.length > 0) {
        console.warn(
          `Found ${missingIds.length} test case evaluations with IDs not in the context`
        );
      }
    }

    return object;
  } catch (error) {
    console.error('AI test case evaluation error:', error);
    throw new Error('Failed to evaluate test cases');
  }
}

async function processTestCaseResults(
  testCaseEvaluation: any[],
  testCases: any[],
  problem: any,
  prompt: string,
  submissionId: string | null
) {
  if (!submissionId) {
    throw new Error('Submission ID is required');
  }

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

      // Evaluate output match using AI
      const { isMatch, confidence, reasoning } = await evaluateOutputMatch(
        problem,
        testCase,
        matchingTestCase,
        prompt
      );

      testCaseInserts.push({
        submission_id: submissionId,
        test_case_id: matchingTestCase.id,
        output: testCase.output,
        matched: isMatch,
        confidence,
        reasoning,
      });
    }
  }

  return testCaseInserts;
}

async function evaluateOutputMatch(
  problem: any,
  testCase: any,
  matchingTestCase: any,
  prompt: string
) {
  try {
    const evaluationPrompt = OUTPUT_COMPARISON_PROMPT.replace(
      '{{problem_description}}',
      problem.description
    )
      .replace('{{test_input}}', testCase.input)
      .replace('{{expected_output}}', matchingTestCase.output)
      .replace('{{model_output}}', testCase.output)
      .replace('{{user_prompt}}', prompt);

    const { object } = await generateObject({
      model: critizierModel,
      schema: TestCaseCheckSchema,
      prompt: evaluationPrompt,
    });

    return {
      isMatch: object.matched,
      confidence: object.confidence || 0,
      reasoning: object.reasoning || '',
    };
  } catch (error) {
    console.error('Error evaluating test case with LLM:', error);
    return {
      isMatch: false,
      confidence: 0,
      reasoning: 'Error during evaluation',
    };
  }
}

async function saveTestCaseResults(testCaseInserts: any[]) {
  if (testCaseInserts.length > 0) {
    try {
      const sbAdmin = await createAdminClient();

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
}

function processCriteriaEvaluations(
  criteriaEvaluation: any[],
  challengeCriteria: any[],
  submissionId: string | null
) {
  if (!submissionId) {
    throw new Error('Submission ID is required');
  }

  const criteriaInserts: Array<
    NovaSubmissionCriteria & {
      strengths?: string[];
      improvements?: string[];
    }
  > = [];

  for (const criteriaEval of criteriaEvaluation) {
    // Match by ID instead of name
    const matchingCriteria = challengeCriteria.find(
      (c) => c.id === criteriaEval.id
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
    } else {
      console.warn(`No matching criteria found for ID: ${criteriaEval.id}`);
    }
  }

  return criteriaInserts;
}

async function saveCriteriaEvaluations(criteriaInserts: any[]) {
  if (criteriaInserts.length > 0) {
    try {
      const sbAdmin = await createAdminClient();

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
      // Don't throw error here to avoid failing the entire request
    }
  }
}
