import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    problemId: string;
  }>;
}

const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY || '';

const genAI = new GoogleGenerativeAI(API_KEY);
const model = 'gemini-2.0-flash';

export const runtime = 'edge';
export const maxDuration = 60;
export const preferredRegion = 'sin1';

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();

  const { prompt, customTestCase } = await req.json();
  const { problemId } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (!prompt || !customTestCase) {
    return NextResponse.json(
      { message: 'Incomplete data provided.' },
      { status: 400 }
    );
  }

  const { data: problem, error: problemError } = await supabase
    .from('nova_problems')
    .select('*')
    .eq('id', problemId)
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
    const systemInstruction = `
      You are an AI assistant that applies a given prompt instruction to process user input.
      
      For context, this is part of a prompt engineering competition with the following problem:
      "${problem.description}"
      
      Example input: "${problem.example_input ?? 'N/A'}"
      Example output: "${problem.example_output ?? 'N/A'}"
      
      But your task is NOT to evaluate. Your task is simply to:
      
      1. Apply this specific prompt instruction:
      "${prompt}"
      
      2. To this specific input:
      "${customTestCase}"
      
      3. Return ONLY a JSON object with this format:
      {
        "input": "test case 1",
        "output": "test case 1 output",
      },
      
      Your response must be valid JSON. Do not include explanations or commentary in the output.
      Don't include markdown formatting like \`\`\`json or \`\`\`.
      Just process the input according to the prompt and return the JSON object.
    `;

    // Get the model and generate content
    const aiModel = genAI.getGenerativeModel({ model });
    const result = await aiModel.generateContent(systemInstruction);
    const response = result.response.text();
    console.log('AI response:', response);
    try {
      // Clean and parse the JSON response
      const cleanResponse = response.replace(/```json\n|\n```|```/g, '').trim();
      const parsedResponse = JSON.parse(cleanResponse);

      return NextResponse.json({ response: parsedResponse }, { status: 200 });
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);

      return NextResponse.json(
        {
          message:
            'Invalid response format. Expected JSON with input and output.',
        },
        { status: 422 }
      );
    }
  } catch (error: any) {
    console.error('Error processing request:', error);
    return NextResponse.json(
      {
        message: `Cannot complete the request: ${error?.message || 'Unknown error'}`,
      },
      { status: 500 }
    );
  }
}
