import { AnthropicStream, StreamingTextResponse } from 'ai';
import Anthropic from '@anthropic-ai/sdk';
import { buildPrompt } from './prompts';

export const runtime = 'edge';

export async function POST(req: Request) {
  const { messages, previewToken } = await req.json();
  if (!messages) return new Response('Missing messages', { status: 400 });

  const apiKey = previewToken || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response('Missing API key', { status: 400 });

  const anthropic = new Anthropic({
    apiKey,
  });

  const prompt = buildPrompt(messages);
  const model = 'claude-2';

  const streamRes = await anthropic.completions.create({
    prompt,
    max_tokens_to_sample: 100000,
    model,
    temperature: 0.9,
    stream: true,
  });

  const stream = AnthropicStream(
    streamRes
    // {
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
