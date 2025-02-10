import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

// Replace this with your actual API key
const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY || '';

// Initialize Google Generative AI Client
const genAI = new GoogleGenerativeAI(API_KEY);

export const runtime = 'edge';
export const maxDuration = 60;
export const preferredRegion = 'sin1';

// Static Problem and Test Case
const problem = "Write a prompt that instructs an AI to generate a short, creative story involving a dragon and a wizard.";
const testCase = "The AI should generate a story where a dragon and a wizard interact in a creative way, no longer than 200 words.";

export async function POST(req: Request) {
  const {
    answer,
    model = 'gemini-pro',
  } = (await req.json()) as {
    answer?: string;
    model?: string;
  };

  try {
    if (!answer) {
      return NextResponse.json(
        { message: 'No answer provided.' },
        { status: 400 }
      );
    }

    // System Instruction for Evaluation with strict JSON output
    const systemInstruction = `You are an examiner in a prompt engineering competition. 
    You will be provided with the problem and its test case. The user will input an answer. 
    Based on the input, evaluate the answer and give a score out of ten.
    
    Problem: ${problem}
    Test Case: ${testCase}
    User's Answer: ${answer}

    Please provide the evaluation in the following JSON format:
    {
      "score": [number from 1 to 10],
      "feedback": "[brief explanation of the score]"
    }
    
    Do not include anything other than the JSON object in your response.`;


    const aiModel = genAI.getGenerativeModel({ model });


    const result = await aiModel.generateContent(systemInstruction);
    const response = result.response.text();


    let parsedResponse;
    try {
      parsedResponse = JSON.parse(response);
    } catch (parseError) {

      return NextResponse.json(
        {
          message: 'AI response was not in valid JSON format.',
          rawResponse: response,
        },
        { status: 200 }
      );
    }

    return NextResponse.json({ response: parsedResponse }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      {
        message: `API Failure\nCould not complete the request.\n\n${error?.stack}`,
      },
      { status: 500 }
    );
  }
}
