// import { GoogleGenerativeAI } from '@google/generative-ai';
// import { createClient } from '@tuturuuu/supabase/next/server';
// import { NextResponse } from 'next/server';
// interface Params {
//   params: Promise<{
//     problemId: string;
//   }>;
// }
// const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY || '';
// const genAI = new GoogleGenerativeAI(API_KEY);
// const model = 'gemini-2.0-flash';
// export const runtime = 'edge';
// export const maxDuration = 60;
// export const preferredRegion = 'sin1';
// export async function POST(req: Request, { params }: Params) {
//   const supabase = await createClient();
//   const { prompt, input } = await req.json();
//   const { problemId } = await params;
//   const {
//     data: { user },
//   } = await supabase.auth.getUser();
//   if (!user) {
//     return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
//   }
//   if (!prompt || !input) {
//     return NextResponse.json(
//       { message: 'Incomplete data provided.' },
//       { status: 400 }
//     );
//   }
//   const { data: problem, error: problemError } = await supabase
//     .from('nova_problems')
//     .select('*')
//     .eq('id', problemId)
//     .single();
//   if (problemError) {
//     return NextResponse.json(
//       { message: 'Error fetching problem.' },
//       { status: 500 }
//     );
//   }
//   if (prompt.length > problem.max_prompt_length) {
//     return NextResponse.json(
//       { message: 'Prompt is too long.' },
//       { status: 400 }
//     );
//   }
//   try {
//     const ctx = {
//       title: problem.title,
//       description: problem.description,
//       exampleInput: problem.example_input,
//       exampleOutput: problem.example_output,
//       testCaseInput: input,
//       userPrompt: prompt,
//     };
//     const exampleResponse = {
//       input: '<test case input>',
//       output: '<your test case output>',
//     };
//     const systemInstruction = `
//       You are an AI assistant that applies a given prompt instruction to process user input.
//       You will be provided with:
//       - A problem title and description
//       - An example input/output
//       - Test cases input
//       - A user's answer or prompt that attempts to solve the problem
//       Your role is to:
//       1. **Attempt** to apply the user's response to provided test case (if the response is executable or can be logically applied).
//       2. **Evaluate** how effectively the user's response addresses the problem.
//       3. **Return** your result for the test case in a specific JSON format.
//       Here is the problem context:
//       ${JSON.stringify(ctx)}
//       Return ONLY a JSON object with this format:
//       ${JSON.stringify(exampleResponse)}
//       Your response must be valid JSON. Do not include explanations or commentary in the output.
//       Don't include markdown formatting like \`\`\`json or \`\`\`.
//       Just process the input according to the prompt and return the JSON object.
//     `;
//     // Get the model and generate content
//     const aiModel = genAI.getGenerativeModel({ model });
//     const result = await aiModel.generateContent(systemInstruction);
//     const response = result.response.text();
//     try {
//       const parsedResponse = JSON.parse(
//         response.replace(/```json\n|\n```/g, '').trim()
//       );
//       return NextResponse.json({ response: parsedResponse }, { status: 200 });
//     } catch (parseError) {
//       console.error('Error parsing AI response:', parseError);
//       return NextResponse.json(
//         {
//           message:
//             'Invalid response format. Expected JSON with input and output.',
//         },
//         { status: 422 }
//       );
//     }
//   } catch (error: any) {
//     console.error('Error processing request:', error);
//     return NextResponse.json(
//       {
//         message: `Cannot complete the request: ${error?.message || 'Unknown error'}`,
//       },
//       { status: 500 }
//     );
//   }
// }
import { POST } from '@tuturuuu/ai/chat/google-vertex/nova/test-case/route';

export const config = {
  maxDuration: 60,
  preferredRegion: 'sin1',
  runtime: 'edge',
};

export { POST };
