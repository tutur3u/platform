import { AnthropicStream, StreamingTextResponse } from 'ai';

// IMPORTANT! Set the runtime to edge
export const runtime = 'edge';

interface Message {
  content: string;
  role: 'system' | 'user' | 'assistant';
}

const initialPrompt: Message | null = null;

function buildPrompt(messages: Message[]) {
  return (
    (initialPrompt ? [initialPrompt, ...messages] : messages)
      .map(({ content, role }) => {
        if (role === 'system') return content;
        if (role === 'user') return `Human: ${content}`;
        else return `Assistant: ${content}`;
      })
      .join('\n\n') + 'Assistant:'
  );
}

export async function POST(req: Request) {
  const { messages } = await req.json();

  const response = await fetch('https://api.anthropic.com/v1/complete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
    } as HeadersInit,
    body: JSON.stringify({
      prompt: buildPrompt(messages),
      model: 'claude-2',
      max_tokens_to_sample: 32 * 1024,
      temperature: 0.9,
      stream: true,
    }),
  });

  if (!response.ok) {
    return new Response(await response.text(), {
      status: response.status,
    });
  }

  const stream = AnthropicStream(response);
  return new StreamingTextResponse(stream);
}
