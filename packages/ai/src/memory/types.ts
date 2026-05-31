import type { LanguageModel } from 'ai';

export const AI_MEMORY_PRODUCTS = [
  'ai_agents',
  'ai_chat',
  'calendar',
  'education',
  'finance',
  'hive',
  'live_assistant',
  'meetings',
  'mind',
  'mira',
  'native_chat',
  'object_generation',
  'playground',
  'rewise',
  'tasks',
  'teach',
] as const;

export type AiMemoryProduct = (typeof AI_MEMORY_PRODUCTS)[number];

export type AiMemoryMetadataValue = string | number | boolean | Array<string>;

export type AiMemoryMetadata = Record<string, AiMemoryMetadataValue>;

export type AiMemoryScopeInput = {
  customId?: string | null;
  metadata?: AiMemoryMetadata;
  product: AiMemoryProduct;
  source?: string | null;
  surface: string;
  userId?: string | null;
  wsId?: string | null;
};

export type AiMemoryScope = {
  containerTag: string;
  customId: string;
  metadata: AiMemoryMetadata;
  product: AiMemoryProduct;
  source?: string | null;
  surface: string;
  userId: string;
  wsId: string;
};

export type AiMemorySettings = {
  enabled: boolean;
  productEnabled: boolean;
  products: Partial<Record<AiMemoryProduct, boolean>>;
};

export type AiMemoryConfig = {
  apiKey: string;
  baseUrl?: string;
  enabled: boolean;
  failOpen: boolean;
  timeoutMs: number;
};

export type AiMemoryResult<T> =
  | { ok: true; skipped?: false; value: T }
  | { ok: true; reason: string; skipped: true; value?: T }
  | { error: string; ok: false; skipped?: false };

export type AiMemorySearchResult = {
  id: string;
  key?: string | null;
  metadata: AiMemoryMetadata | null;
  score: number;
  updatedAt: string;
  value: string;
};

export type AiMemoryDocument = {
  category?: string | null;
  content?: string | null;
  id: string;
  key?: string | null;
  metadata: AiMemoryMetadata | null;
  status: string;
  summary?: string | null;
  title?: string | null;
  updatedAt: string;
};

export type AiMemoryModelOptions<TModel extends LanguageModel = LanguageModel> =
  {
    addMemory?: 'always' | 'never';
    customId?: string | null;
    mode?: 'profile' | 'query' | 'full';
    model: TModel;
    product: AiMemoryProduct;
    source?: string | null;
    surface: string;
    userId?: string | null;
    wsId?: string | null;
  };
