import { AnthropicStream, StreamingTextResponse } from 'ai';
import { buildPrompt } from './prompts';

// export const runtime = 'edge';

export async function POST(req: Request) {
  const { messages, previewToken } = await req.json();

  const prompt = buildPrompt(messages);
  const model = 'claude-2';

  console.log('prompt', prompt);

  const response = await fetch('https://api.anthropic.com/v1/complete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': previewToken || process.env.ANTHROPIC_API_KEY,
    } as HeadersInit,
    body: JSON.stringify({
      prompt,
      model,
      max_tokens_to_sample: 95 * 1024,
      temperature: 0.9,
      stream: true,
    }),
  });

  if (!response.ok) {
    return new Response(await response.text(), {
      status: response.status,
    });
  }

  const stream = AnthropicStream(
    response
    // ,{
    // onStart: async () => {
    // This callback is called when the stream starts
    // You can use this to save the prompt to your database
    // await savePromptToDatabase(prompt);
    // console.log('start');
    // },
    // onToken: async (token: string) => {
    // This callback is called for each token in the stream
    // You can use this to debug the stream or save the tokens to your database
    // console.log('token', token);
    // },
    // onCompletion: async (completion: string) => {
    // This callback is called when the completion is ready
    // You can use this to save the final completion to your database
    // await saveCompletionToDatabase(completion);
    // console.log(completion);
    // },
    // }
  );
  return new StreamingTextResponse(stream);
}
