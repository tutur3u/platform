import type { ResponseMode } from '../../../../types';
import { google } from '@ai-sdk/google';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { generateText } from 'ai';
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
  const supabase = await createClient();

  const { id, prompt, input } = await req.json();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (!id) {
    return NextResponse.json(
      { message: 'Incomplete id data provided.' },
      { status: 400 }
    );
  }

  if (!prompt || !input) {
    return NextResponse.json(
      { message: 'Incomplete data provided.' },
      { status: 400 }
    );
  }

  const { data: problem, error: problemError } = await supabase
    .from('nova_problems')
    .select('*')
    .eq('id', id)
    .single();

  if (problemError) {
    return NextResponse.json(
      { message: 'Error fetching problem.' },
      { status: 500 }
    );
  }

  if (prompt.length > problem.max_prompt_length) {
    return NextResponse.json(
      { message: 'Prompt is too long.' },
      { status: 400 }
    );
  }

  try {
    const ctx = {
      title: problem.title,
      description: problem.description,
      exampleInput: problem.example_input,
      exampleOutput: problem.example_output,
      testCaseInput: input,
      userPrompt: prompt,
    };

    const exampleResponse = {
      input: '<test case input>',
      output: '<your test case output>',
    };

    const systemInstruction = `
        You are an AI assistant that applies a given prompt instruction to process user input.
        You will be provided with:
        - A problem title and description
        - An example input/output
        - Test cases input
        - A user's answer or prompt that attempts to solve the problem
  
        Your role is to:
        1. **Attempt** to apply the user's response to provided test case (if the response is executable or can be logically applied). 
        2. **Evaluate** how effectively the user's response addresses the problem.
        3. **Return** your result for the test case in a specific JSON format.
        
        Here is the problem context:
        ${JSON.stringify(ctx)}
        
        Return ONLY a JSON object with this format:
        ${JSON.stringify(exampleResponse)}
  
        Your response must be valid JSON. Do not include explanations or commentary in the output.
        Don't include markdown formatting like \`\`\`json or \`\`\`.
        Just process the input according to the prompt and return the JSON object.
      `;
    const res = await generateText({
      model: vertexModel,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt },
      ],
    });

    const response = res.steps[0]?.text;

    try {
      const parsedResponse = JSON.parse(
        (response ?? '').replace(/```json\n|\n```/g, '').trim()
      );
      console.log(parsedResponse);
      return NextResponse.json({ response: parsedResponse }, { status: 200 });
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
  } catch (err) {
    console.error('Error processing request:', err);
    return NextResponse.json(
      {
        message: `Cannot complete the request: ${err || 'Unknown error'}`,
      },
      { status: 500 }
    );
  }
}
