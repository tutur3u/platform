import type { ResponseMode } from '../../../../types';
import { google } from '@ai-sdk/google';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { streamText } from 'ai';
import { createStreamableValue } from 'ai/rsc';
import { NextResponse } from 'next/server';

const DEFAULT_MODEL_NAME = 'gemini-1.5-flash-002';
export const runtime = 'edge';
export const maxDuration = 60;
export const preferredRegion = 'sin1';

const vertexModel = google(DEFAULT_MODEL_NAME, {
  safetySettings: [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
  ],
});

export async function POST(req: Request) {
  const sbAdmin = await createAdminClient();
  const supabase = createClient();
  const { id, prompt } = (await req.json()) as {
    id?: string;
    model?: string;
    prompt?: string;
    mode?: ResponseMode;
  };

  try {
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

    const { data: problem, error: problemError } = await sbAdmin
      .from('nova_problems')
      .select('*')
      .eq('id', id || '')
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
      .eq('problem_id', id || '');

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

    const systemInstruction = `
You are an examiner in a prompt engineering competition.
You will be provided with:
- A problem title and description
- An example input/output
- Test cases inputs (optional)
- Criteria
- A user's answer or prompt that attempts to solve the problem

Your role is to:
1. Attempt to apply the user's response to each provided test case.
2. Evaluate how effectively the user's response addresses the problem.
3. Return both your results for each test case and the criteria evaluation in a specific JSON format.

Here is the problem context:
${JSON.stringify(ctx)}

Scoring Criteria:
- 10: Perfect solution or prompt.
- 7–9: Mostly solves the problem, minor issues.
- 4–6: Some understanding, but notable issues.
- 1–3: Attempts but mostly incorrect or incomplete.
- 0: Irrelevant or non-attempt.

Important:
- Score from 0 to 10.
- Only respond with a valid JSON object.
- No markdown or code blocks.
- Use this exact format:
${JSON.stringify(exampleResponse)}
`;

    // --- FIXED: Stream and collect model output ---
    const { textStream } = await streamText({
      model: vertexModel,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt },
      ],
    });

    let fullResponse = '';
    const stream = createStreamableValue('');
    for await (const delta of textStream) {
      stream.update(delta);
    }
    stream.done();
    console.log(stream.value.curr, ' valuueuehhjbjhbjhb');
    try {
      const parsedResponse = JSON.parse(stream.value.curr.toString());
      return NextResponse.json(parsedResponse);
    } catch (error) {
      console.error('❌ Failed to parse JSON:', error);
      console.error('📄 Raw response:', fullResponse.slice(0, 1000)); // Add snippet for debug
      return NextResponse.json(
        { error: 'Failed to parse model response' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('🚨 Server error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
