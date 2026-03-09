'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import type { AIModelUI } from '@tuturuuu/types';

export const MIRA_GATEWAY_MODELS_QUERY_KEY = ['ai-gateway-models', 'enabled'];

export type GatewayModelUi = AIModelUI & {
  inputPricePerToken?: number;
  maxTokens?: number;
  outputPricePerToken?: number;
};

export async function fetchGatewayModels(): Promise<GatewayModelUi[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('ai_gateway_models')
    .select(
      'id, name, provider, description, context_window, max_tokens, type, tags, is_enabled, input_price_per_token, output_price_per_token'
    )
    .eq('type', 'language')
    .order('provider')
    .order('name');

  if (error || !data?.length) return [];

  return data.map((model) => {
    const inputPricePerToken = Number(model.input_price_per_token ?? 0);
    const outputPricePerToken = Number(model.output_price_per_token ?? 0);

    return {
      context: model.context_window ?? undefined,
      description: model.description ?? undefined,
      disabled: !model.is_enabled,
      inputPricePerToken:
        Number.isFinite(inputPricePerToken) && inputPricePerToken > 0
          ? inputPricePerToken
          : undefined,
      label: model.name,
      maxTokens: model.max_tokens ?? undefined,
      outputPricePerToken:
        Number.isFinite(outputPricePerToken) && outputPricePerToken > 0
          ? outputPricePerToken
          : undefined,
      provider: model.provider,
      tags: model.tags ?? undefined,
      value: model.id,
    };
  });
}

export function modelSupportsFileInput(model?: Pick<AIModelUI, 'tags'> | null) {
  return Array.isArray(model?.tags) && model.tags.includes('file-input');
}
