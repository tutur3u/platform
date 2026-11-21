import type { AiMemoryConfig } from './types';

const DEFAULT_TIMEOUT_MS = 1500;

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getAiMemoryConfig(): AiMemoryConfig | null {
  const failOpen = parseBoolean(process.env.SUPERMEMORY_FAIL_OPEN, true);
  const timeoutMs = parsePositiveInt(
    process.env.SUPERMEMORY_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS
  );
  if (parseBoolean(process.env.MEMORY_ASSISTANT_WORKER_ENABLED, false)) {
    const apiKey = process.env.MEMORY_ASSISTANT_CALLER_SECRET?.trim();
    const baseUrl = getMemoryWorkerOrigin(
      process.env.MEMORY_ASSISTANT_WORKER_URL
    );
    if (!apiKey || !baseUrl) return null;
    return {
      apiKey,
      baseUrl,
      enabled: true,
      failOpen,
      timeoutMs,
      transport: 'cloudflare-worker',
    };
  }

  const apiKey = process.env.SUPERMEMORY_API_KEY?.trim();
  const enabled = parseBoolean(process.env.SUPERMEMORY_ENABLED, false);

  if (!enabled || !apiKey) return null;

  const baseUrl = process.env.SUPERMEMORY_BASE_URL?.trim();

  return {
    apiKey,
    ...(baseUrl ? { baseUrl } : {}),
    enabled,
    failOpen,
    timeoutMs,
  };
}

export function getMemoryWorkerOrigin(input?: string) {
  if (!input?.trim()) return null;
  try {
    const url = new URL(input.trim());
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

export function isAiMemoryConfigured() {
  return !!getAiMemoryConfig();
}
