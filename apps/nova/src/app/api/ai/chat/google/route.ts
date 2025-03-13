import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

// Replace this with your actual API key
const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY || '';

// Initialize Google Generative AI Client
const genAI = new GoogleGenerativeAI(API_KEY);

const model = 'gemini-2.0-flash';

export const runtime = 'edge';
export const maxDuration = 60;
export const preferredRegion = 'sin1';

export async function POST(req: Request) {
  const {
    answer,
    problemDescription,
    testCases,
    exampleInput,
    exampleOutput,
  }: {
    answer?: string;
    problemDescription?: string;
    testCases?: string[];
    exampleInput?: string;
    exampleOutput?: string;
  } = await req.json();

  try {
    if (!answer || !problemDescription || !testCases) {
      return NextResponse.json(
        { message: 'Incomplete data provided.' },
        { status: 400 }
      );
    }

    // System Instruction for Evaluation with strict JSON output
    const systemInstruction = `
      You are an examiner in a prompt engineering competition.
      You will be provided with a problem description and a test case. The user will input a prompt or an answer designed to solve the problem.
      Your role is to evaluate the user's response based on how effectively it guides or solves the problem.

      Problem: ${problemDescription}
      Test Case: ${testCases ? testCases.join('\n') : ''}
      Example Input: ${exampleInput ?? ''}
      Example Output: ${exampleOutput ?? ''}
      User's Answer: ${answer ?? ''}

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
      {"score": 7, "feedback": "Your explanation here"}
    `;
    // Get the model
    const aiModel = genAI.getGenerativeModel({ model });

    // Send the instruction to Google API
    const result = await aiModel.generateContent(systemInstruction);
    const response = result.response.text();

    console.log('Raw AI response:', response); // Debug logging

    let parsedResponse;
    try {
      // More robust cleaning of the response
      let cleanedResponse = response;

      // Remove any markdown code blocks
      cleanedResponse = cleanedResponse
        .replace(/```json\n|\n```|```/g, '')
        .trim();

      // If the response still isn't valid JSON, try to extract just the JSON part
      if (!cleanedResponse.startsWith('{')) {
        const jsonMatch = cleanedResponse.match(/({[\s\S]*})/);
        if (jsonMatch && jsonMatch[1]) {
          cleanedResponse = jsonMatch[1];
        }
      }

      console.log('Cleaned response:', cleanedResponse); // Debug logging

      parsedResponse = JSON.parse(cleanedResponse);

      // Handle the case where score might be an array
      if (Array.isArray(parsedResponse.score)) {
        parsedResponse.score = parsedResponse.score[0];
      }

      // Ensure both required properties exist
      if (
        parsedResponse.score === undefined ||
        parsedResponse.feedback === undefined
      ) {
        throw new Error('Missing required properties in response');
      }

      // Validate the response structure
      if (
        typeof parsedResponse.score !== 'number' ||
        typeof parsedResponse.feedback !== 'string' ||
        parsedResponse.score < 0 ||
        parsedResponse.score > 10
      ) {
        throw new Error('Invalid response format');
      }
    } catch (parseError) {
      console.error('Parse error:', parseError); // Debug logging

      return NextResponse.json(
        {
          message:
            'Invalid response format. Expected JSON with score and feedback.',
          rawResponse: response,
          error: (parseError as Error).message,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({ response: parsedResponse }, { status: 200 });
  } catch (error: any) {
    console.error('General error:', error); // Debug logging

    return NextResponse.json(
      {
        message: `Can not complete the request.\n\n${error?.stack || error.message}`,
      },
      { status: 500 }
    );
  }
}
