import { CREDIT_UNIT_USD } from '@tuturuuu/ai/credits/constants';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { gateway, generateText } from 'ai';
import type { MeteredUsage, UsageCostCalculator } from './public-api';

export const GEMINI_FLASH_IMAGE = 'google/gemini-3.1-flash-image';

export function isGeminiFlashImage(modelId: string) {
  return modelId === GEMINI_FLASH_IMAGE;
}

export function creditsForProviderCost(
  providerCostUsd: number,
  markup: number
) {
  if (
    !Number.isFinite(providerCostUsd) ||
    providerCostUsd < 0 ||
    !Number.isFinite(markup) ||
    markup <= 0
  ) {
    throw new Error('Image generation pricing is unavailable.');
  }
  return {
    providerCostUsd,
    billedCredits:
      providerCostUsd === 0
        ? 0
        : Math.max(1, (providerCostUsd / CREDIT_UNIT_USD) * markup),
  };
}

/** Keep the gateway receipt authoritative: Gemini prices image and text output differently. */
export function createGeminiImageBilling(prompt: string, count: number) {
  let actualCost: number | undefined;
  let receiptError: unknown;
  let markup: number | undefined;
  const usage: MeteredUsage = {};
  const generationIds: string[] = [];
  const calculateCost: UsageCostCalculator = async (measured, workspaceId) => {
    if (markup === undefined) {
      const admin = await createAdminClient({ noCookie: true });
      const tier = await admin.rpc('_resolve_workspace_tier', {
        p_ws_id: workspaceId,
      });
      if (tier.error || !tier.data)
        throw new Error('Image credit plan is unavailable.');
      const plan = await admin
        .from('ai_credit_plan_allocations')
        .select('markup_multiplier')
        .eq('tier', tier.data)
        .eq('is_active', true)
        .single();
      if (plan.error || !plan.data)
        throw new Error('Image credit pricing is unavailable.');
      markup = Number(plan.data.markup_multiplier ?? 1);
    }
    if (measured === usage) {
      if (receiptError) throw receiptError;
      return creditsForProviderCost(actualCost ?? 0, markup);
    }
    // Conservative reservation for 1K images, <=4096 output tokens and text-only input.
    // Settlement uses the actual gateway receipt, never this estimate.
    return creditsForProviderCost(
      count * (0.25 + prompt.length * 0.0000005),
      markup
    );
  };
  return {
    calculateCost,
    usage,
    generationIds,
    async generate(request: Request, aspectRatio: string) {
      const result = await generateText({
        model: gateway(GEMINI_FLASH_IMAGE),
        prompt,
        abortSignal: request.signal,
        maxRetries: 0,
        maxOutputTokens: 4096,
        providerOptions: {
          google: {
            responseModalities: ['IMAGE'],
            imageConfig: { imageSize: '1K', aspectRatio },
          },
        },
      });
      usage.inputTokens =
        (usage.inputTokens ?? 0) + (result.usage.inputTokens ?? 0);
      usage.outputTokens =
        (usage.outputTokens ?? 0) + (result.usage.outputTokens ?? 0);
      usage.reasoningTokens =
        (usage.reasoningTokens ?? 0) +
        (result.usage.outputTokenDetails.reasoningTokens ?? 0);
      const images = result.files.filter((file) =>
        file.mediaType.startsWith('image/')
      );
      usage.imageUnits = (usage.imageUnits ?? 0) + images.length;
      const id = result.providerMetadata?.gateway?.generationId;
      try {
        if (typeof id !== 'string')
          throw new Error('Image generation receipt is missing.');
        generationIds.push(id);
        const receipt = await gateway.getGenerationInfo({ id });
        const cost = receipt.isByok
          ? receipt.upstreamInferenceCost
          : receipt.totalCost;
        if (
          receipt.model !== GEMINI_FLASH_IMAGE ||
          !Number.isFinite(cost) ||
          cost <= 0
        ) {
          throw new Error('Image generation receipt pricing is unavailable.');
        }
        actualCost = (actualCost ?? 0) + cost;
      } catch (error) {
        receiptError = error;
        throw error;
      }
      if (images.length !== 1)
        throw new Error(
          'The AI did not return exactly one image. Try a simpler artwork prompt.'
        );
      return { image: images[0]! };
    },
  };
}
