import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

// Initialize Google Generative AI Client
const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY || '';
const genAI = new GoogleGenerativeAI(API_KEY);
const model = 'gemini-2.0-flash';

interface Params {
  params: Promise<{
    problemId: string;
  }>;
}

export async function POST(request: Request, {}: Params) {
  const supabase = await createClient();
  const { prompt, customTestCase, problemDescription } = await request.json();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // Validate required fields
  if (!prompt || !customTestCase || !problemDescription) {
    return NextResponse.json(
      {
        message:
          'Prompt, custom test case, and problem description are required',
      },
      { status: 400 }
    );
  }

  try {
    // System Instruction for Evaluation with the custom test case
    const systemInstruction = `
      You are an examiner in a prompt engineering competition.
      You will be provided with a problem description and a custom test case. The user will input a prompt designed to solve the problem.
      Your role is to evaluate the user's prompt based on how effectively it would solve the problem when applied to this specific test case.

      Problem: ${problemDescription}
      Custom Test Case: ${customTestCase}
      User's Prompt: ${prompt}

      Provide detailed feedback on:
      1. How well the prompt would handle this specific test case
      2. Strengths and weaknesses of the prompt
      3. Suggestions for improvement specific to handling this test case
      4. A score from 0-10 for how well the prompt would handle this test case

      Format your response as a JSON object with the following structure:
      {
        "score": [number from 0 to 10],
        "feedback": "[detailed explanation with specific points about how the prompt would handle this test case]",
        "suggestions": "[concrete suggestions for improvement]"
      }
    `;

    // Get the model and generate content
    const aiModel = genAI.getGenerativeModel({ model });
    const result = await aiModel.generateContent(systemInstruction);
    const response = result.response.text();

    let parsedResponse;
    try {
      // Clean response if it contains markdown code blocks
      const cleanedResponse = response.replace(/```json\n|\n```/g, '').trim();
      parsedResponse = JSON.parse(cleanedResponse);

      // Validate the response structure
      if (
        typeof parsedResponse.score !== 'number' ||
        typeof parsedResponse.feedback !== 'string' ||
        typeof parsedResponse.suggestions !== 'string' ||
        parsedResponse.score < 0 ||
        parsedResponse.score > 10
      ) {
        throw new Error('Invalid response format');
      }
    } catch (parseError) {
      return NextResponse.json(
        {
          message: 'Invalid response format from AI service',
          rawResponse: response,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({ response: parsedResponse }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { message: `Error processing request: ${error.message}` },
      { status: 500 }
    );
  }
}
