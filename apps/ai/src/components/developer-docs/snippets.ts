export const AI_STUDIO_BASE_URL = 'https://ai.tuturuuu.com/v1';

export const listModelsCurl = `curl "${AI_STUDIO_BASE_URL}/models" \\
  --header "Authorization: Bearer $TUTURUUU_AI_API_KEY"`;

export const responsesCurl = `curl "${AI_STUDIO_BASE_URL}/responses" \\
  --header "Authorization: Bearer $TUTURUUU_AI_API_KEY" \\
  --header "Content-Type: application/json" \\
  --header "X-Request-Id: checkout-summary-001" \\
  --header "Idempotency-Key: checkout-summary-001" \\
  --data '{
    "model": "google/gemini-3.5-flash-lite",
    "instructions": "Answer clearly and concisely.",
    "input": "Summarize the three most important launch risks.",
    "max_output_tokens": 800
  }'`;

export const responsesTypeScript = `const requestId = crypto.randomUUID();
const response = await fetch('https://ai.tuturuuu.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: \`Bearer \${process.env.TUTURUUU_AI_API_KEY}\`,
      'Content-Type': 'application/json',
      'X-Request-Id': requestId,
      'Idempotency-Key': requestId,
    },
    body: JSON.stringify({
      model: 'google/gemini-3.5-flash-lite',
      instructions: 'Answer clearly and concisely.',
      input: 'Summarize the three most important launch risks.',
      max_output_tokens: 800,
    }),
});

const responseRequestId = response.headers.get('x-request-id');
const payload = await response.json();

if (!response.ok) {
  throw new Error(
    \`\${payload.error?.code}: \${payload.error?.message} (\${responseRequestId})\`
  );
}

console.log(payload.output_text);`;

export const chatCompletionsCurl = `curl "${AI_STUDIO_BASE_URL}/chat/completions" \\
  --header "Authorization: Bearer $TUTURUUU_AI_API_KEY" \\
  --header "Content-Type: application/json" \\
  --data '{
    "model": "google/gemini-3.5-flash-lite",
    "messages": [
      {"role": "system", "content": "You are a concise support assistant."},
      {"role": "user", "content": "Draft a friendly renewal reminder."}
    ],
    "max_completion_tokens": 500
  }'`;

export const toolLoopCurl = `curl "${AI_STUDIO_BASE_URL}/responses" \\
  --header "Authorization: Bearer $TUTURUUU_AI_API_KEY" \\
  --header "Content-Type: application/json" \\
  --data '{
    "model": "google/gemini-3.5-flash-lite",
    "input": "What time is it in Asia/Ho_Chi_Minh and what is 128 × 37?",
    "tuturuuu": {
      "max_steps": 4,
      "tools": ["current_time", "calculator"]
    }
  }'`;

export const streamingTypeScript = `async function streamResponse() {
  const response = await fetch('https://ai.tuturuuu.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: \`Bearer \${process.env.TUTURUUU_AI_API_KEY}\`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-3.5-flash-lite',
      input: 'Write a short product launch update.',
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(\`AI request failed: \${response.status}\`);
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += value;
    const frames = buffer.split('\\n\\n');
    buffer = frames.pop() ?? '';

    for (const frame of frames) {
      const data = frame.split('\\n').find((line) => line.startsWith('data: '));
      if (!data) continue;
      const value = data.slice(6);
      if (value === '[DONE]') return;

      const event = JSON.parse(value);
      if (event.type === 'response.output_text.delta') {
        process.stdout.write(event.delta);
      }
    }
  }
}

await streamResponse();`;

export const environmentExample =
  'TUTURUUU_AI_API_KEY=ttr_ai_replace_with_your_one_time_secret';
