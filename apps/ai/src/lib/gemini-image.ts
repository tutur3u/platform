import { google } from '@ai-sdk/google';
import { CREDIT_UNIT_USD } from '@tuturuuu/ai/credits/constants';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { generateText } from 'ai';
import { z } from 'zod';
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

const tokenCount = z.number().int().nonnegative();
const googleUsageSchema = z.object({
  promptTokenCount: tokenCount,
  candidatesTokenCount: tokenCount.default(0),
  thoughtsTokenCount: tokenCount.default(0),
  cachedContentTokenCount: tokenCount.default(0),
  candidatesTokensDetails: z
    .array(
      z.object({
        modality: z.enum(['TEXT', 'IMAGE']),
        tokenCount,
      })
    )
    .default([]),
});

/** Google standard pricing verified 2026-09-11: input $0.50/M, text/thinking $3/M, image $60/M.
 * https://ai.google.dev/gemini-api/docs/pricing#gemini-3.1-flash-image
 * No search, cached-content references, audio, or image inputs are submitted here.
 */
export function priceGoogleImageUsage(raw: unknown, imageCount: number) {
  const usage = googleUsageSchema.parse(raw);
  const imageTokens = usage.candidatesTokensDetails
    .filter((detail) => detail.modality === 'IMAGE')
    .reduce((sum, detail) => sum + detail.tokenCount, 0);
  if (
    usage.cachedContentTokenCount > 0 ||
    imageTokens > usage.candidatesTokenCount ||
    (imageCount > 0 && imageTokens === 0)
  ) {
    throw new Error('Image modality pricing requires complete uncached usage.');
  }
  return (
    (usage.promptTokenCount * 0.5 +
      (usage.candidatesTokenCount - imageTokens + usage.thoughtsTokenCount) *
        3 +
      imageTokens * 60) /
    1_000_000
  );
}

/** Gemini image and text output have separate prices; never bill images at the text rate. */
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
    // Settlement uses actual Google modality token counts, never this estimate.
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
        model: google(GEMINI_FLASH_IMAGE.replace('google/', '')),
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
      const id = result.response.id;
      try {
        if (id) generationIds.push(id);
        const cost = priceGoogleImageUsage(
          result.providerMetadata?.google?.usageMetadata,
          images.length
        );
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
