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
import type { NovaProblem } from '@tuturuuu/types/db';
import { checkPermission } from '@tuturuuu/utils/nova/submissions/check-permission';
import { generateObject, streamObject } from 'ai';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  MAIN_EVALUATION_PROMPT,
  OUTPUT_COMPARISON_PROMPT,
  PLAGIARISM_DETECTION_PROMPT,
  TEST_CASE_EVALUATION_PROMPT,
} from './prompts';

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

// API route handler
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ problemId: string }> }
) {
  const encoder = new TextEncoder();
  const supabase = await createClient();
  const sbAdmin = await createAdminClient();

  let submissionId: string | null = null;

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

        // Parse request data
        sendProgress({
          step: 'initialization',
          progress: 5,
          message: 'Initializing evaluation process...',
        });

        const { prompt, sessionId } = (await req.json()) as {
          id?: string;
          model?: string;
          prompt?: string;
          sessionId?: string;
        };

        // Authenticate user
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user?.id) {
          throw new Error('Unauthorized');
        }

        if (!prompt) {
          throw new Error('Incomplete data provided');
        }

        const { problemId } = await params;

        if (!problemId) {
          throw new Error('Incomplete data provided');
        }

        sendProgress({
          step: 'fetching_problem',
          progress: 10,
          message: 'Fetching problem details...',
        });

        // Fetch problem details
        const { data: problem, error: problemError } =
          await fetchProblem(problemId);

        if (problemError || !problem) {
          throw new Error('Error fetching problem');
        }

        // Validate prompt length
        if (prompt.length > problem.max_prompt_length) {
          throw new Error('Prompt is too long');
        }

        sendProgress({
          step: 'checking_permissions',
          progress: 15,
          message: 'Checking submission permissions...',
        });

        // Check submission permissions
        const { canSubmit, message } = await checkPermission({
          problemId,
          sessionId: sessionId || null,
        });

        if (!canSubmit) {
          throw new Error(message || 'Permission denied');
        }

        sendProgress({
          step: 'plagiarism_check',
          progress: 20,
          message: 'Performing plagiarism analysis...',
        });

        // Check for plagiarism
        const plagiarismResults = await checkPlagiarism(problem, prompt);

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
          prompt,
          plagiarismResults
        );

        sendProgress({
          step: 'creating_submission',
          progress: 30,
          message: 'Creating submission record...',
        });

        // Create submission record early
        const submission = await createSubmissionRecord(
          prompt,
          problemId,
          sessionId,
          user.id,
          'Evaluation in progress...'
        );

        if (!submission) {
          throw new Error('Failed to create submission record');
        }

        submissionId = submission.id;

        sendProgress({
          step: 'evaluating_criteria',
          progress: 40,
          message: 'Evaluating prompt against criteria...',
          data: { submissionId },
        });

        // Step 1: Stream criteria evaluation if criteria exist
        let evaluation: CombinedEvaluation = {
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
          message: 'Running test case evaluations...',
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
              userPrompt: prompt,
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
            prompt,
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
          message: 'Finalizing submission...',
        });

        // Update submission with final assessment
        await sbAdmin
          .from('nova_submissions')
          .update({ overall_assessment: evaluation.overallAssessment })
          .eq('id', submissionId);

        sendProgress({
          step: 'completed',
          progress: 100,
          message: 'Evaluation completed successfully!',
          data: {
            submissionId: submissionId,
            response: evaluation,
            matchedTestCases: testCaseInserts.filter((tc) => tc.matched).length,
            totalTestCases: testCaseInserts.length,
          },
        });

        controller.close();
      } catch (error: any) {
        console.error('🚨 Server error:', error);

        // Clean up the submission if it was created but processing failed
        if (submissionId) {
          try {
            await sbAdmin
              .from('nova_submissions')
              .delete()
              .eq('id', submissionId);
          } catch (deleteError) {
            console.error('Failed to delete submission:', deleteError);
          }
        }

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

// Stream criteria evaluation with real-time updates
async function _performCriteriaEvaluation(ctx: {
  problem: NovaProblem;
  testCases: NovaProblemTestCase[];
  challengeCriteria: NovaChallengeCriteria[];
  prompt: string;
  plagiarismResults: PlagiarismCheck | null;
}): Promise<CombinedEvaluation> {
  try {
    const systemInstruction = MAIN_EVALUATION_PROMPT.replace(
      '{{context}}',
      JSON.stringify(ctx)
    );

    sendProgress({
      step: 'criteria_ai_processing',
      progress: 45,
      message: 'AI is analyzing your prompt against evaluation criteria...',
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
      const criteriaIdsInContext = new Set(ctx.criteria.map((c: any) => c.id));
      const missingIds = finalObject.criteriaEvaluation.filter(
        (ce: any) => !criteriaIdsInContext.has(ce.id)
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
      message: 'Criteria evaluation completed!',
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
  ctx: {
    userPrompt: string;
    testCaseInputs: { id: string; input: string }[];
  },
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
      message: 'AI is generating outputs for test cases...',
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
        message: `Generating output ${Array.isArray(delta) ? delta.length : 0} of ${ctx.testCaseInputs.length}...`,
        data: {
          partialResults: delta,
          phase: 'generation', // Explicitly mark as generation phase
          generatedCount: Array.isArray(delta) ? delta.length : 0,
          totalCount: ctx.testCaseInputs.length,
        },
      });
    }

    const finalObject = await result.object;

    // Validate that all test case evaluations have valid IDs
    if (finalObject && Array.isArray(finalObject)) {
      const testCaseIdsInContext = new Set(
        ctx.testCaseInputs.map((tc: any) => tc.id)
      );
      const missingIds = finalObject.filter(
        (tc: any) => !testCaseIdsInContext.has(tc.id)
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
      message: 'Test case generation completed!',
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
  problem: NovaProblem,
  testCases: NovaProblemTestCase[],
  challengeCriteria: NovaChallengeCriteria[],
  prompt: string,
  plagiarismResults: PlagiarismCheck | null
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

async function processTestCaseResults(
  testCaseEvaluation: any[],
  testCases: any[],
  problem: any,
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
      message: 'Starting evaluation of test case outputs...',
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
          message: `Evaluated ${processedCount}/${totalCount} test cases (${currentMatched} passed)`,
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
