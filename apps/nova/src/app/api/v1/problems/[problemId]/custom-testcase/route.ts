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
  const { problemId } = await params;

  const {
    problem,
    customTestCase,
  }: {
    problem: string;
    customTestCase: string;
  } = await req.json();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { data: submissions, error } = await supabase
    .from('nova_submissions')
    .select('prompt, score')
    .eq('problem_id', problemId)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json(
      { message: 'Error fetching submissions' },
      { status: 500 }
    );
  }

  if (!submissions || submissions.length === 0) {
    return NextResponse.json(
      { message: 'No submissions found for this problem' },
      { status: 404 }
    );
  }

  // Find the submission with the highest score
  const highestScoreSubmission = submissions.reduce((prev, current) =>
    prev.score > current.score ? prev : current
  );

  const userInput = highestScoreSubmission.prompt;

  try {
    // System Instruction for Evaluation with strict JSON output
    const systemInstruction = `
      You are an AI assistant evaluating a user's prompt or solution to a given problem.

      Problem: ${problem}
      Test Case: ${customTestCase}
      User's Input: ${userInput}

      Scoring Criteria:
      - **10**: Perfect solution or prompt that completely addresses the problem.
      - **7-9**: Very good solution with minor issues or inefficiencies.
      - **4-6**: Partial solution with notable issues or gaps.
      - **1-3**: Attempted solution but mostly incorrect or incomplete.
      - **0**: Irrelevant or completely misses the problem.

      Important Notes:
      1. If the user's input is a prompt (rather than code), evaluate how well the prompt would guide an AI to solve the problem.
      2. Test the user's input against the provided test case.
      3. Be specific in your feedback about what works and what doesn't.
      4. Only respond with the following JSON format:
      {
        "score": [number from 0 to 10],
        "feedback": "[detailed explanation of the score, including test results]"
      }
    `;

    // Get the model and generate content
    const aiModel = genAI.getGenerativeModel({ model });
    const result = await aiModel.generateContent(systemInstruction);
    const response = result.response.text();

    let parsedResponse;
    try {
      // Clean the response if it contains markdown code blocks
      const cleanedResponse = response.replace(/```json\n|\n```/g, '').trim();
      parsedResponse = JSON.parse(cleanedResponse);

      // Validate the response structure
      if (
        typeof parsedResponse.score !== 'number' ||
        typeof parsedResponse.feedback !== 'string' ||
        parsedResponse.score < 0 ||
        parsedResponse.score > 10
      ) {
        throw new Error('Invalid response format');
      }

      return NextResponse.json(
        {
          submission: {
            input: userInput,
            originalScore: highestScoreSubmission.score,
          },
          response: parsedResponse,
        },
        { status: 200 }
      );
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);
      return NextResponse.json(
        {
          message:
            'Invalid response format. Expected JSON with score and feedback.',
          rawResponse: response,
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
