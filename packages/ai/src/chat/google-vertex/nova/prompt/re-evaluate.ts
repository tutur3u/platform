import { google } from '@ai-sdk/google';
import type { SafetySetting } from '@google/generative-ai';
import {
  MAIN_EVALUATION_PROMPT,
  OUTPUT_COMPARISON_PROMPT,
  PLAGIARISM_DETECTION_PROMPT,
  TEST_CASE_EVALUATION_PROMPT,
} from '@tuturuuu/ai/chat/google-vertex/nova/prompt/prompts';
import type {
  NovaSubmissionCriteria,
  NovaSubmissionTestCase,
} from '@tuturuuu/ai/types';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { NovaProblem } from '@tuturuuu/types/db';
import { generateObject, streamObject } from 'ai';
import type { NextRequest } from 'next/server';
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

const evaluatorModel = google('gemini-2.0-flash', {
  safetySettings: modelSafetySettings,
});

// Schema definitions (reused from the original route)
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

// Progress update schema
const ProgressUpdateSchema = z.object({
  step: z.string().describe('Current step being performed'),
  progress: z.number().min(0).max(100).describe('Progress percentage'),
  message: z.string().describe('Human-readable progress message'),
  data: z.any().optional().describe('Optional step-specific data'),
});

type ProgressUpdate = z.infer<typeof ProgressUpdateSchema>;

// Helper function to safely serialize progress data
function safeSerializeProgress(update: ProgressUpdate): string {
  try {
    // Sanitize the message to prevent JSON parsing issues
    const sanitized = {
      ...update,
      message: update.message
        .replace(/[\n\r]/g, ' ') // Replace newlines with spaces
        .replace(/\\/g, '\\\\') // Escape backslashes
        .replace(/"/g, '\\"') // Escape quotes
        .trim(),
      step: update.step.trim(),
    };

    // If there's data, sanitize it as well
    if (sanitized.data) {
      // Convert data to string and sanitize if it's not already a primitive
      if (typeof sanitized.data === 'object') {
        try {
          sanitized.data = JSON.parse(JSON.stringify(sanitized.data));
        } catch {
          // If data can't be serialized, remove it to prevent errors
          sanitized.data = { error: 'Data serialization failed' };
        }
      }
    }

    return JSON.stringify(sanitized);
  } catch (error) {
    console.error('Error serializing progress update:', error);
    // Return a safe fallback
    return JSON.stringify({
      step: 'error',
      progress: 0,
      message: 'Serialization error occurred',
      data: { originalError: String(error) },
    });
  }
}

interface Params {
  params: Promise<{
    submissionId: string;
  }>;
}

// API route handler
export async function POST(_: NextRequest, { params }: Params) {
  const encoder = new TextEncoder();
  const supabase = await createClient();
  const sbAdmin = await createAdminClient();

  const { submissionId } = await params;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const sendProgress = (update: ProgressUpdate) => {
          try {
            const serializedData = safeSerializeProgress(update);
            const data = `data: ${serializedData}\n\n`;
            controller.enqueue(encoder.encode(data));
          } catch (error) {
            console.error('Failed to send progress update:', error);
            // Send a safe error message instead
            const errorData = `data: ${JSON.stringify({
              step: 'error',
              progress: 0,
              message: 'Communication error occurred',
            })}\n\n`;
            controller.enqueue(encoder.encode(errorData));
          }
        };

        // Initialize evaluation process
        sendProgress({
          step: 'initialization',
          progress: 5,
          message: 'Initializing re-evaluation process...',
        });

        // Authenticate user
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user?.id) {
          throw new Error('Unauthorized');
        }

        sendProgress({
          step: 'fetching_submission',
          progress: 10,
          message: 'Fetching submission details...',
        });

        // Fetch submission with full details
        const { data: submission, error: submissionError } = await sbAdmin
          .from('nova_submissions')
          .select('*')
          .eq('id', submissionId)
          .single();

        if (submissionError || !submission) {
          throw new Error('Submission not found');
        }

        // Check permission - user must own the submission or be admin
        if (submission.user_id !== user.id) {
          // Check if user is admin (you may need to adjust this logic based on your admin system)
          // For now, we'll allow any authenticated user to re-evaluate for admin dashboard
          // You might want to add proper admin role checking here
        }

        sendProgress({
          step: 'fetching_problem',
          progress: 15,
          message: 'Fetching problem details...',
        });

        // Fetch problem details
        const { data: problem, error: problemError } = await sbAdmin
          .from('nova_problems')
          .select('*')
          .eq('id', submission.problem_id)
          .single();

        if (problemError || !problem) {
          throw new Error('Error fetching problem');
        }

        sendProgress({
          step: 'plagiarism_check',
          progress: 20,
          message: 'Performing plagiarism analysis...',
        });

        // Check for plagiarism
        const plagiarismResults = await checkPlagiarism(
          problem,
          submission.prompt
        );

        sendProgress({
          step: 'fetching_test_data',
          progress: 25,
          message: 'Loading test cases and evaluation criteria...',
        });

        // Fetch test cases and challenge criteria
        const { testCases, challengeCriteria } =
          await fetchTestCasesAndCriteria(problem);

        // Build evaluation context
        const ctx = buildEvaluationContext(
          problem,
          testCases,
          challengeCriteria,
          submission.prompt,
          plagiarismResults
        );

        sendProgress({
          step: 'clearing_old_results',
          progress: 30,
          message: 'Clearing previous evaluation results...',
        });

        // Clear existing criteria and test case results
        await clearExistingResults(submissionId);

        sendProgress({
          step: 'evaluating_criteria',
          progress: 40,
          message: 'Re-evaluating prompt against criteria...',
          data: { submissionId },
        });

        // Step 1: Stream criteria evaluation if criteria exist
        let evaluation: {
          criteriaEvaluation: z.infer<
            typeof CriteriaEvaluationSchema
          >['criteriaEvaluation'];
          overallAssessment: string;
          totalScore: number;
        } = {
          criteriaEvaluation: [],
          overallAssessment: 'No evaluation performed (no criteria available)',
          totalScore: 0,
        };

        if (challengeCriteria && challengeCriteria.length > 0) {
          const criteriaResult = await streamCriteriaEvaluation(
            ctx,
            sendProgress
          );
          evaluation = criteriaResult;

          // Save criteria evaluations
          const criteriaInserts = processCriteriaEvaluations(
            evaluation.criteriaEvaluation,
            challengeCriteria,
            submissionId
          );
          await saveCriteriaEvaluations(criteriaInserts);
        } else {
          sendProgress({
            step: 'criteria_skipped',
            progress: 60,
            message: 'No criteria found, skipping criteria evaluation...',
          });
        }

        sendProgress({
          step: 'evaluating_test_cases',
          progress: 65,
          message: 'Re-running test case evaluations...',
        });

        let testCaseInserts: Array<
          NovaSubmissionTestCase & {
            confidence?: number;
            reasoning?: string;
          }
        > = [];

        // Step 2: Stream test case evaluation if test cases exist
        if (testCases && testCases.length > 0) {
          const testCaseEvaluation = await streamTestCaseEvaluation(
            {
              userPrompt: submission.prompt,
              testCaseInputs: testCases.map((tc) => ({
                id: tc.id,
                input: tc.input,
              })),
            },
            sendProgress
          );

          sendProgress({
            step: 'processing_test_results',
            progress: 85,
            message: 'Processing test case results...',
          });

          // Process and save test case results
          testCaseInserts = await processTestCaseResults(
            testCaseEvaluation,
            testCases,
            problem,
            submission.prompt,
            submissionId,
            sendProgress
          );

          await saveTestCaseResults(testCaseInserts);
        } else {
          sendProgress({
            step: 'test_cases_skipped',
            progress: 85,
            message: 'No test cases found, skipping test case evaluation...',
          });
        }

        sendProgress({
          step: 'finalizing',
          progress: 95,
          message: 'Finalizing re-evaluation...',
        });

        // Update submission with final assessment
        await sbAdmin
          .from('nova_submissions')
          .update({
            overall_assessment: evaluation.overallAssessment,
            updated_at: new Date().toISOString(),
          })
          .eq('id', submissionId);

        sendProgress({
          step: 'completed',
          progress: 100,
          message: 'Re-evaluation completed successfully!',
          data: {
            submissionId: submissionId,
            response: evaluation,
            matchedTestCases: testCaseInserts.filter((tc) => tc.matched).length,
            totalTestCases: testCaseInserts.length,
          },
        });

        controller.close();
      } catch (error: unknown) {
        console.error('🚨 Re-evaluation error:', error);

        const errorUpdate = {
          step: 'error',
          progress: 0,
          message: `Error: ${error.message}`,
          data: { error: error.message },
        };

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(errorUpdate)}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

// Helper function to clear existing evaluation results
async function clearExistingResults(submissionId: string) {
  const sbAdmin = await createAdminClient();

  // Clear existing criteria evaluations
  await sbAdmin
    .from('nova_submission_criteria')
    .delete()
    .eq('submission_id', submissionId);

  // Clear existing test case results
  await sbAdmin
    .from('nova_submission_test_cases')
    .delete()
    .eq('submission_id', submissionId);
}

// Reuse helper functions from the original route
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
  problem: NovaProblem,
  testCases: NovaProblemTestCase[],
  challengeCriteria: NovaChallengeCriteria[],
  prompt: string,
  plagiarismResults: z.infer<typeof PlagiarismSchema> // TODO: Define a proper type for plagiarismResults
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

// Stream criteria evaluation with real-time updates
async function streamCriteriaEvaluation(
  ctx: EvaluationContext,
  sendProgress: (update: ProgressUpdate) => void
) {
  try {
    const systemInstruction = MAIN_EVALUATION_PROMPT.replace(
      '{{context}}',
      JSON.stringify(ctx)
    );

    sendProgress({
      step: 'criteria_ai_processing',
      progress: 45,
      message: 'AI is re-analyzing prompt against evaluation criteria...',
    });

    const result = streamObject({
      model: critizierModel,
      schema: CriteriaEvaluationSchema,
      prompt: ctx.userPrompt,
      system: systemInstruction,
    });

    let progressIncrement = 0;

    for await (const delta of result.partialObjectStream) {
      progressIncrement += 2;

      sendProgress({
        step: 'criteria_streaming',
        progress: Math.min(45 + progressIncrement, 58),
        message: 'Receiving criteria evaluation results...',
        data: { partialEvaluation: delta },
      });
    }

    const finalObject = await result.object;

    // Validate that all criteria evaluations have valid IDs
    if (finalObject.criteriaEvaluation) {
      const criteriaIdsInContext = new Set(ctx.criteria.map((c) => c.id));
      const missingIds = finalObject.criteriaEvaluation.filter(
        (
          ce: z.infer<
            typeof CriteriaEvaluationSchema
          >['criteriaEvaluation'][number]
        ) => !criteriaIdsInContext.has(ce.id)
      );

      if (missingIds.length > 0) {
        console.warn(
          `Found ${missingIds.length} criteria evaluations with IDs not in the context`
        );
      }
    }

    sendProgress({
      step: 'criteria_completed',
      progress: 60,
      message: 'Criteria re-evaluation completed!',
      data: { evaluation: finalObject },
    });

    return finalObject;
  } catch (error) {
    console.error('AI criteria evaluation error:', error);
    throw new Error('Failed to evaluate prompt criteria');
  }
}

// Stream test case evaluation with real-time updates
async function streamTestCaseEvaluation(
  ctx: EvaluationContext,
  sendProgress: (update: ProgressUpdate) => void
) {
  try {
    const testCaseInstruction = TEST_CASE_EVALUATION_PROMPT.replace(
      '{{context}}',
      JSON.stringify(ctx)
    );

    sendProgress({
      step: 'test_case_ai_processing',
      progress: 70,
      message: 'AI is re-generating outputs for test cases...',
    });

    const result = streamObject({
      model: evaluatorModel,
      schema: TestCaseEvaluationSchema,
      prompt: ctx.userPrompt,
      system: testCaseInstruction,
    });

    let progressIncrement = 0;

    for await (const delta of result.partialObjectStream) {
      progressIncrement += 1;

      sendProgress({
        step: 'test_case_streaming',
        progress: Math.min(70 + progressIncrement, 82),
        message: `Regenerating output ${Array.isArray(delta) ? delta.length : 0} of ${ctx.testCaseInputs.length}...`,
        data: {
          partialResults: delta,
          phase: 'generation',
          generatedCount: Array.isArray(delta) ? delta.length : 0,
          totalCount: ctx.testCaseInputs.length,
        },
      });
    }

    const finalObject = await result.object;

    // Validate that all test case evaluations have valid IDs
    if (finalObject && Array.isArray(finalObject)) {
      const testCaseIdsInContext = new Set(
        ctx.testCaseInputs.map((tc) => tc.id)
      );
      const missingIds = finalObject.filter(
        (tc) => !testCaseIdsInContext.has(tc.id)
      );

      if (missingIds.length > 0) {
        console.warn(
          `Found ${missingIds.length} test case evaluations with IDs not in the context`
        );
      }
    }

    sendProgress({
      step: 'test_case_completed',
      progress: 83,
      message: 'Test case re-generation completed!',
      data: {
        testCaseResults: finalObject,
        phase: 'generation_complete',
      },
    });

    return finalObject;
  } catch (error) {
    console.error('AI test case evaluation error:', error);
    throw new Error('Failed to evaluate test cases');
  }
}

function processCriteriaEvaluations(
  criteriaEvaluation: z.infer<
    typeof CriteriaEvaluationSchema
  >['criteriaEvaluation'],
  challengeCriteria: NovaChallengeCriteria[],
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

async function saveCriteriaEvaluations(
  criteriaInserts: NovaSubmissionCriteria[]
) {
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
    }
  }
}

async function processTestCaseResults(
  testCaseEvaluation: z.infer<typeof TestCaseEvaluationSchema>,
  testCases: NovaProblemTestCase[],
  problem: NovaProblem,
  prompt: string,
  submissionId: string | null,
  sendProgress?: (update: ProgressUpdate) => void
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

  let processedCount = 0;
  const totalCount = testCaseEvaluation.length;

  // Send initial evaluation phase message
  if (sendProgress) {
    sendProgress({
      step: 'processing_test_results',
      progress: 85,
      message: 'Starting re-evaluation of test case outputs...',
      data: {
        phase: 'evaluation_start',
        totalTestCases: totalCount,
      },
    });
  }

  for (const testCase of testCaseEvaluation) {
    const matchingTestCase = testCases.find((tc) => tc.id === testCase.id);
    if (matchingTestCase) {
      console.log(
        `Re-evaluating test case - Input: ${testCase.input}, AI Output: ${testCase.output}, Expected: ${matchingTestCase.output}`
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

      processedCount++;

      // Send progress update with current match results
      if (sendProgress) {
        const currentMatched = testCaseInserts.filter(
          (tc) => tc.matched
        ).length;
        const progressPercentage =
          85 + Math.round((processedCount / totalCount) * 10); // 85-95% range

        sendProgress({
          step: 'processing_test_results',
          progress: progressPercentage,
          message: `Re-evaluated ${processedCount}/${totalCount} test cases (${currentMatched} passed)`,
          data: {
            phase: 'evaluation',
            testCaseResults: testCaseInserts.map((tc) => ({
              id: tc.test_case_id,
              matched: tc.matched,
              output: tc.output,
              confidence: tc.confidence,
              reasoning: tc.reasoning,
            })),
            matchedTestCases: currentMatched,
            totalTestCases: processedCount,
            isPartialResults: processedCount < totalCount,
          },
        });
      }
    }
  }

  return testCaseInserts;
}

async function evaluateOutputMatch(
  problem: NovaProblem,
  testCase: z.infer<typeof TestCaseEvaluationSchema>[number],
  matchingTestCase: NovaProblemTestCase,
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

async function saveTestCaseResults(testCaseInserts: NovaSubmissionTestCase[]) {
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
