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

2. **Process Test Cases**: For each test case:
   - Apply the user's prompt/solution to generate an appropriate output
   - Document your reasoning process
   - Record both the generated output and your reasoning

3. **Evaluate Against Criteria**: For each criterion:
   - Assess how effectively the submission addresses the specific criterion
   - Provide a score from 0-10 (decimal values allowed)
   - Give detailed feedback with specific examples from the submission
   - Identify key strengths and suggest specific improvements

4. **Multi-language Considerations**:
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
| 0-0.9 | Insufficient: The submission is entirely off-topic, irrelevant, or simply restates the problem without providing a solution approach. |

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
        overall_assessment: evaluation.overallAssessment || '',
      })
      .select('id')
      .single();

    if (submissionError) {
      console.error('Submission error:', submissionError);
      // If the error is due to missing columns, proceed without those fields
      const { data: fallbackSubmission, error: fallbackError } = await sbAdmin
        .from('nova_submissions')
        .insert({
          prompt,
          problem_id: problemId,
          session_id: sessionId,
          user_id: user.id,
        })
        .select('id')
        .single();

      if (fallbackError) {
        return NextResponse.json(
          { message: 'Failed to create submission record' },
          { status: 500 }
        );
      }

      submissionId = fallbackSubmission.id;
    } else {
      submissionId = submission.id;
    }

    // Step 4: Save test case results
    const testCaseEvaluation = evaluation.testCaseEvaluation || [];
    const testCaseInserts: Array<
      NovaSubmissionTestCase & {
        confidence?: number;
        reasoning?: string;
      }
    > = [];

    for (const testCase of testCaseEvaluation) {
      const matchingTestCase = testCases.find(
        (tc) => tc.input === testCase.input
      );
      if (matchingTestCase) {
        console.log(
          `Evaluating test case - Input: ${testCase.input}, AI Output: ${testCase.output}, Expected: ${matchingTestCase.output}`
        );

        // --- Enhanced LLM-based evaluation ---
        const evaluationPrompt = `
# Output Evaluation Task

You are tasked with evaluating whether a language model's output matches the expected output for a prompt engineering problem. This is a critical evaluation that requires careful analysis.

## Context
- **Problem Description**: ${problem.description}
- **Input**: ${testCase.input}
- **Expected Output**: ${matchingTestCase.output}
- **Model Output**: ${testCase.output}

## Evaluation Instructions

1. **Semantic Equivalence Analysis**:
   - Determine if the outputs convey the same meaning and fulfill the same function
   - Consider paraphrasing, synonyms, formatting differences, and alternative expressions
   - Account for valid variations in style, tone, or presentation
   - For numerical outputs, check mathematical equivalence rather than exact format

2. **Contextual Appropriateness**:
   - Assess if both outputs satisfy the requirements specified in the problem description
   - Consider whether differences affect functionality or are merely stylistic

3. **Language Considerations**:
   - If outputs are in different languages, focus on whether they convey equivalent information
   - Account for cultural or linguistic variations in expression

## Decision Framework
- **Match (true)**: Outputs are functionally equivalent despite stylistic differences
- **No Match (false)**: Outputs differ in meaningful ways that affect their function or accuracy

## Required Response Format
Provide your evaluation as a JSON object with three fields:
- **matched**: boolean (true/false) indicating semantic equivalence
- **confidence**: number (0-1) indicating your confidence level
- **reasoning**: brief explanation of your assessment

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
        } catch (error) {
          console.error('Error evaluating test case with LLM:', error);
          isMatch = false;
        }

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
