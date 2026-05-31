import Supermemory from 'supermemory';
import { getAiMemoryConfig } from './config';
import type { AiMemoryConfig } from './types';

let cachedClient: Supermemory | null = null;
let cachedSignature: string | null = null;

function configSignature(config: AiMemoryConfig) {
  return [config.apiKey, config.baseUrl ?? ''].join('|');
}

export function getSupermemoryClient(config = getAiMemoryConfig()) {
  if (!config) return null;

  const signature = configSignature(config);
  if (!cachedClient || cachedSignature !== signature) {
    cachedClient = new Supermemory({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      maxRetries: 1,
      timeout: config.timeoutMs,
    });
    cachedSignature = signature;
  }

  return cachedClient;
}
