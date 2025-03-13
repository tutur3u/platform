import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY || '';

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

    console.log('problem description: ', problemDescription);
    console.log('test cases: ', testCases);
    console.log('example input: ', exampleInput);
    console.log('example output: ', exampleOutput);
    console.log('answer: ', answer);

    // System Instruction for Evaluation with strict JSON output
    // const systemInstruction = `
    //   You are an examiner in a prompt engineering competition.
    //   You will be provided with a problem description and a test case. The user will input a prompt or an answer designed to solve the problem.
    //   Your role is to evaluate the user's response based on how effectively it guides or solves the problem.

    //   Problem: ${problemDescription}
    //   Test Case: ${testCases ? testCases.join('\n') : ''}
    //   Example Input: ${exampleInput ?? ''}
    //   Example Output: ${exampleOutput ?? ''}
    //   User's Answer: ${answer ?? ''}

    //   Scoring Criteria:
    //   - **10**: The user's response perfectly solves the problem or provides a clear and effective prompt that would solve the problem.
    //   - **7-9**: The response mostly solves the problem or gives a good prompt but with minor inefficiencies or missing details.
    //   - **4-6**: The response shows some understanding but has notable errors, incomplete results, or inefficient approaches.
    //   - **1-3**: The response attempts to address the problem but is mostly incorrect, irrelevant, or incomplete.
    //   - **0**: The response is entirely irrelevant or simply repeats the problem description without guiding towards a solution.

    //   Important Notes:
    //   1. **If the user's response is an effective prompt** that guides solving the problem (e.g., "Summarize the paragraph in just one sentence"), it should be **scored based on how well it would solve the task**.
    //   2. Only assign **0** if the response does not attempt to solve the problem or is irrelevant.
    //   3. Ensure the feedback clearly explains why the score was assigned, focusing on how well the response addresses the problem.
    //   4. Only respond with the following JSON format:
    //   {
    //     "score": [number from 0 to 10],
    //     "feedback": "[brief explanation of the score]"
    //     "testCaseOutputs": "[the correct answer of the 'testcase' variables]"
    //   }
    // `;

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

  Problem: ${problemDescription}
  Test Cases:
  ${testCases ? testCases.join('\\n') : ''}

  Example Input: ${exampleInput ?? ''}
  Example Output: ${exampleOutput ?? ''}

  User's Answer: ${answer ?? ''}

  ---

  Scoring Criteria:
  - **10**: The user's response perfectly solves the problem or provides a clear and effective prompt that would solve the problem.
  - **7-9**: The response mostly solves the problem or gives a good prompt but with minor inefficiencies or missing details.
  - **4-6**: The response shows some understanding but has notable errors, incomplete results, or inefficient approaches.
  - **1-3**: The response attempts to address the problem but is mostly incorrect, irrelevant, or incomplete.
  - **0**: The response is entirely irrelevant or simply repeats the problem description without guiding towards a solution.

  Important Notes:
  1. **If the user's response is an effective prompt**, it should be **scored based on how well it solves the task** when applied to the test cases.
  2. Assign **0** only if the response does not attempt to solve the problem or is completely irrelevant.
  3. Ensure the feedback clearly explains why the score was assigned, focusing on how well the response addresses the problem.
  4. **Attempt** to run the user's solution on each test case. If it cannot be run or does not apply, briefly explain why in the output.
  5. Only respond in the following JSON format (and do not include additional keys):

  {
    "score": [number from 0 to 10],
    "feedback": "[brief explanation of the score]",
    "testCaseResults": [
      {
        "input": "[test case input]",
        "output": "[the correct results of the testcases input]"
      },
      ...
    ]
  }
`;

    // Get the model
    const aiModel = genAI.getGenerativeModel({ model });

    // Send the instruction to Google API
    const result = await aiModel.generateContent(systemInstruction);
    const response = result.response.text();

    let parsedResponse;
    try {
      // First try to clean the response if it contains markdown code blocks
      const cleanedResponse = response.replace(/```json\n|\n```/g, '').trim();
      parsedResponse = JSON.parse(cleanedResponse);
      console.log('parseResponse: ', parsedResponse);

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
      return NextResponse.json(
        {
          message:
            'Invalid response format. Expected JSON with score and feedback.',
          rawResponse: response,
        },
        { status: 422 } // Changed status to 422 Unprocessable Entity
      );
    }

    return NextResponse.json({ response: parsedResponse }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      {
        message: `Can not complete the request.\n\n${error?.stack}`,
      },
      { status: 500 }
    );
  }
}
