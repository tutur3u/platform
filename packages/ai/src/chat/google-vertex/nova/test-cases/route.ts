import { TestCaseSchema } from './schema';
import { google } from '@ai-sdk/google';
import { vertex } from '@ai-sdk/google-vertex/edge';
import type { SafetySetting } from '@google/generative-ai';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { streamObject } from 'ai';
import { type NextRequest, NextResponse } from 'next/server';

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

    // Create system instruction with problem and test case context
    // Only provide inputs, not expected outputs
    const systemInstruction = `
# Test Case Evaluation System

You are an expert evaluator in prompt engineering. Your task is to accurately evaluate how well a user's prompt performs on test cases.

## Input Information
You will receive:
- Problem title and description
- Example input/output pairs (for context only)
- Test case inputs (without expected outputs)
- User's submitted prompt

## Your Evaluation Process

1. For each test case:
   - Apply the user's prompt to the test case input
   - Generate your own output for the test case
   - Compare your output to what you believe would be the expected output based on the problem context
   - Evaluate if they would be semantically equivalent
   - Provide your confidence level and reasoning

## Output Format Requirements
- Structure your evaluation according to the JSON schema provided
- For each test case, include:
  - The test case ID
  - Whether outputs match (boolean)
  - Your confidence level (0-1)
  - Brief reasoning for your assessment
  - The output you generated

Return ONLY a valid JSON object without any additional text.

Here is the problem context:
- Title: ${problem.title}
- Description: ${problem.description}
- Example Input: ${problem.example_input}
- Example Output: ${problem.example_output}

And here are the test case inputs to evaluate:
${JSON.stringify(
  testCases.map((tc) => ({
    id: tc.id,
    input: tc.input,
    output: tc.output,
  }))
)}

User's Prompt: ${prompt}
`;

    try {
      const result = streamObject({
        model: model,
        schema: TestCaseSchema,
        prompt: "Please evaluate the test cases using the user's prompt",
        system: systemInstruction,
        onFinish: async (result) => {
          const testCaseResults = (
            result.object?.testCaseEvaluation || []
          ).filter(
            (tc) => tc.id !== undefined && testCases.some((t) => t.id === tc.id)
          );

          try {
            const { error: testCaseInsertError } = await sbAdmin
              .from('nova_submission_test_cases')
              .insert(
                testCaseResults.map((tc) => ({
                  submission_id: submissionId,
                  test_case_id: tc.id,
                  output: tc.output,
                  matched: tc.matched,
                  confidence: tc.confidence,
                  reasoning: tc.reasoning,
                }))
              );

            if (testCaseInsertError) {
              console.error('Error inserting test cases:', testCaseInsertError);
            }
          } catch (error) {
            console.error('Failed to create test case results:', error);
          }
        },
      });

      return result.toTextStreamResponse();
    } catch (error) {
      console.error('AI evaluation error:', error);
      return NextResponse.json(
        { message: 'Failed to evaluate test cases' },
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
