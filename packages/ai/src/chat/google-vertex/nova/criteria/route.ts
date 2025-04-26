import { EvaluationSchema } from './schema';
import { google } from '@ai-sdk/google';
import { vertex } from '@ai-sdk/google-vertex/edge';
import type { SafetySetting } from '@google/generative-ai';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { generateObject, streamObject } from 'ai';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const DEFAULT_MODEL_NAME = 'gemini-1.5-flash-002';

function getModelProvider() {
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

const model =
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
  const supabase = createClient();
  const sbAdmin = await createAdminClient();

  try {
    const { prompt, submissionId } = (await req.json()) as {
      prompt?: string;
      submissionId?: string;
    };

    if (!submissionId) {
      return NextResponse.json(
        { message: 'Incomplete data provided' },
        { status: 400 }
      );
    }

    if (!prompt) {
      return NextResponse.json(
        { message: 'Incomplete data provided' },
        { status: 400 }
      );
    }

    const {
      data: { user },
    } = await (await supabase).auth.getUser();

    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
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

    // Add plagiarism detection check against problem description
    const plagiarismSchema = z.object({
      similarity_score: z.number().min(0).max(1),
      is_plagiarism: z.boolean(),
      reasoning: z.string(),
    });

    let plagiarismResults = null;
    try {
      const { object: plagiarismCheck } = await generateObject({
        model: model,
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
        id: criteria.id,
        name: criteria.name,
        description: criteria.description,
      })),
      userPrompt: prompt,
      plagiarismCheck: plagiarismResults,
    };

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

    try {
      const result = streamObject({
        model: model,
        schema: EvaluationSchema,
        prompt,
        system: systemInstruction,
        onFinish: async (result) => {
          const criteriaEvaluation = (
            result.object?.criteriaEvaluation || []
          ).filter(
            (c) =>
              c.id !== undefined &&
              challengeCriteria.some((cc) => cc.id === c.id)
          );

          const { error: submissionError } = await sbAdmin
            .from('nova_submission_criteria')
            .insert(
              criteriaEvaluation.map((c) => ({
                submission_id: submissionId,
                criteria_id: c.id,
                score: c.score,
                feedback: c.feedback,
                strengths: c.strengths,
                improvements: c.improvements,
              }))
            )
            .select('*');

          if (submissionError) {
            console.error('Submission error:', submissionError);
          }
        },
      });

      return result.toTextStreamResponse();
    } catch (error) {
      console.error('AI evaluation error:', error);
      return NextResponse.json(
        { message: 'Failed to evaluate prompt' },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('🚨 Server error:', error);

    return NextResponse.json(
      { message: `Internal server error: ${error.message}` },
      { status: 500 }
    );
  }
}
