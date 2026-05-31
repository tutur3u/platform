import { withSupermemory } from '@supermemory/tools/ai-sdk';
import type { LanguageModel } from 'ai';
import { getAiMemoryConfig } from './config';
import { resolveAiMemoryScope } from './scope';
import type { AiMemoryModelOptions } from './types';

export async function withAiMemory<TModel extends LanguageModel>({
  addMemory = 'always',
  customId,
  mode = 'full',
  model,
  product,
  source,
  surface,
  userId,
  wsId,
}: AiMemoryModelOptions<TModel>): Promise<TModel> {
  const config = getAiMemoryConfig();
  const scope = resolveAiMemoryScope({
    customId,
    product,
    source,
    surface,
    userId,
    wsId,
  });
  if (!config || !scope) return model;

  const { isAiMemoryEnabledForScope } = await import('./settings');
  const enabled = await isAiMemoryEnabledForScope({
    product,
    userId: scope.userId,
    wsId: scope.wsId,
  });
  if (!enabled) return model;

  return withSupermemory(model as never, {
    addMemory,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    containerTag: scope.containerTag,
    customId: scope.customId,
    mode,
    skipMemoryOnError: config.failOpen,
  }) as TModel;
}
