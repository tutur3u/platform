import 'server-only';

const DEFAULT_MODEL = 'gemma4';

export type HiveOllamaAction = 'generate' | 'load' | 'status' | 'unload';

function getOllamaBaseUrl() {
  return process.env.HIVE_OLLAMA_BASE_URL?.trim() || null;
}

export async function runHiveOllamaAction(input: {
  action: HiveOllamaAction;
  keepAlive?: string;
  prompt?: string;
}) {
  const baseUrl = getOllamaBaseUrl();

  if (!baseUrl) {
    return {
      ok: false as const,
      error: 'Hive Ollama is not configured',
    };
  }

  if (input.action === 'status') {
    const response = await fetch(new URL('/api/tags', baseUrl), {
      cache: 'no-store',
    });
    return {
      ok: response.ok,
      status: response.status,
      body: response.ok ? await response.json() : null,
    } as const;
  }

  const keepAlive = input.action === 'unload' ? 0 : (input.keepAlive ?? '5m');
  const prompt =
    input.action === 'load' || input.action === 'unload'
      ? ''
      : (input.prompt ?? 'Summarize the current Hive simulation state.');
  const response = await fetch(new URL('/api/generate', baseUrl), {
    body: JSON.stringify({
      keep_alive: keepAlive,
      model: DEFAULT_MODEL,
      prompt,
      stream: false,
    }),
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });

  return {
    ok: response.ok,
    status: response.status,
    body: response.ok ? await response.json() : null,
  } as const;
}
