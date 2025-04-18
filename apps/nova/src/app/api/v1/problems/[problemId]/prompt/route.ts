import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
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
  const { prompt } = await req.json();
  const { problemId } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (!prompt) {
    return NextResponse.json(
      { message: 'Incomplete data provided.' },
      { status: 400 }
    );
  }

  const sbAdmin = await createAdminClient();

  const { data: problem, error: problemError } = await sbAdmin
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

  const { data: testCases, error: testCasesError } = await sbAdmin
    .from('nova_problem_test_cases')
    .select('*')
    .eq('problem_id', problemId);

  if (testCasesError) {
    return NextResponse.json(
      { message: 'Error fetching test cases.' },
      { status: 500 }
    );
  }

  const testCaseStrings = testCases
    .map((testCase) => testCase.input)
    .join('\n');

  try {
    // System Instruction for Evaluation with strict JSON output
    const systemInstruction = `
      You are an examiner in a prompt engineering competition.
      You will be provided with:
      - A problem description
      - One or more test cases
      - An example input/output (optional)
      - A user's answer or prompt that attempts to solve the problem

      Your role is to:
      1. **Evaluate** how effectively the user's response addresses the problem.
      2. **Attempt** to apply the user's response to each provided test case (if the response is executable or can be logically applied). 
      3. **Return** both your evaluation and the results for each test case in a specific JSON format.

      Here is the problem context:
      Problem: ${problem.description}
      Test Cases: ${testCaseStrings}
      Example Input: ${problem.example_input ?? ''}
      Example Output: ${problem.example_output ?? ''}
      User's Prompt: ${prompt}

      Scoring Criteria:
      - **10**: The user's response perfectly solves the problem or provides a clear and effective prompt that would solve the problem.
      - **7-9**: The response mostly solves the problem or gives a good prompt but with minor inefficiencies or missing details.
      - **4-6**: The response shows some understanding but has notable errors, incomplete results, or inefficient approaches.
      - **1-3**: The response attempts to address the problem but is mostly incorrect, irrelevant, or incomplete.
      - **0**: The response is entirely irrelevant or simply repeats the problem description without guiding towards a solution.

      Important Notes:
      1. **If the user's response is an effective prompt** that guides solving the problem (e.g., "Summarize the paragraph in just one sentence"), it should be **scored based on how well it would solve the task**.
      2. Only assign **0** if the response does not attempt to solve the problem or is irrelevant.
      3. Ensure the feedback clearly explains why the score was assigned, focusing on how well the response addresses the problem.
      4. CRITICAL: You MUST respond with ONLY a valid, properly formatted JSON object without any markdown formatting or code blocks. 
      5. The score MUST be a single number (not an array).
      6. The response MUST use this EXACT format:
      {
        "score": 7,
        "feedback": "Your explanation here"
      }
    `;
    // Get the model
    const aiModel = genAI.getGenerativeModel({ model });

    // Send the instruction to Google API
    const result = await aiModel.generateContent(systemInstruction);
    const response = result.response.text();

    try {
      const parsedResponse = JSON.parse(
        response.replace(/```json\n|\n```/g, '').trim()
      );

      // Validate the response structure
      if (
        typeof parsedResponse.score !== 'number' ||
        typeof parsedResponse.feedback !== 'string' ||
        parsedResponse.score < 0 ||
        parsedResponse.score > 10
      ) {
        throw new Error('Invalid response format');
      }

      return NextResponse.json({ response: parsedResponse }, { status: 200 });
    } catch (parseError) {
      console.error('Parse error:', parseError);

      return NextResponse.json(
        {
          message:
            'Invalid response format. Expected JSON with score and feedback.',
        },
        { status: 422 }
      );
    }
  } catch (error: any) {
    console.error('General error:', error);

    return NextResponse.json(
      {
        message: `Can not complete the request.\n\n${error?.stack || error.message}`,
      },
      { status: 500 }
    );
  }
}
