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
  const apiKey = process.env.SUPERMEMORY_API_KEY?.trim();
  const enabled = parseBoolean(process.env.SUPERMEMORY_ENABLED, false);

  if (!enabled || !apiKey) return null;

  const baseUrl = process.env.SUPERMEMORY_BASE_URL?.trim();

  return {
    apiKey,
    ...(baseUrl ? { baseUrl } : {}),
    enabled,
    failOpen: parseBoolean(process.env.SUPERMEMORY_FAIL_OPEN, true),
    timeoutMs: parsePositiveInt(
      process.env.SUPERMEMORY_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS
    ),
  };
}

export function isAiMemoryConfigured() {
  return !!getAiMemoryConfig();
}
