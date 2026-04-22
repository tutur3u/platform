import { google } from '@ai-sdk/google';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { generateObject } from 'ai';
import { z } from 'zod';
import { runSepayAiEnrichment } from './ai-billing';
import type { NormalizedSepayPayload } from './schemas';

type SepayAdminClient = TypedSupabaseClient;

const CATEGORY_CONFIDENCE_THRESHOLD = 0.6;
const CLASSIFIER_MODEL = 'gemini-3.1-flash-lite-preview';
const CLASSIFIER_TIMEOUT_MS = 4_000;
const fallbackCategoryCache = new Map<string, Promise<string>>();

const classifierResultSchema = z.object({
  categoryId: z.guid(),
  confidence: z.number().min(0).max(1),
  reason: z.string().trim().max(300),
});

async function ensureFallbackCategory(input: {
  isExpense: boolean;
  sbAdmin: SepayAdminClient;
  wsId: string;
}) {
  const fallbackName = input.isExpense
    ? 'Uncategorized Expense'
    : 'Uncategorized Income';
  const cacheKey = `${input.wsId}:${input.isExpense ? 'expense' : 'income'}`;

  const cached = fallbackCategoryCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const fallbackCategoryPromise = (async () => {
    const { data: existing, error: existingError } = await input.sbAdmin
      .from('transaction_categories')
      .select('id')
      .eq('ws_id', input.wsId)
      .eq('name', fallbackName)
      .eq('is_expense', input.isExpense)
      .order('created_at', { ascending: true })
      .limit(1);

    if (existingError) {
      throw new Error('Failed to lookup fallback transaction category');
    }

    const existingCategoryId = existing?.[0]?.id;
    if (existingCategoryId) {
      return existingCategoryId;
    }

    const { data: created, error: createError } = await input.sbAdmin
      .from('transaction_categories')
      .insert({
        color: null,
        icon: null,
        is_expense: input.isExpense,
        name: fallbackName,
        ws_id: input.wsId,
      })
      .select('id')
      .single();

    if (!createError && created?.id) {
      return created.id;
    }

    const { data: retried, error: retryError } = await input.sbAdmin
      .from('transaction_categories')
      .select('id')
      .eq('ws_id', input.wsId)
      .eq('name', fallbackName)
      .eq('is_expense', input.isExpense)
      .order('created_at', { ascending: true })
      .limit(1);

    if (retryError) {
      throw new Error('Failed to re-query fallback transaction category');
    }

    const retriedCategoryId = retried?.[0]?.id;
    if (!retriedCategoryId) {
      throw new Error('Failed to create fallback transaction category');
    }

    return retriedCategoryId;
  })();

  fallbackCategoryCache.set(cacheKey, fallbackCategoryPromise);

  try {
    return await fallbackCategoryPromise;
  } finally {
    fallbackCategoryCache.delete(cacheKey);
  }
}

export async function classifyCategoryId(input: {
  isExpense: boolean;
  payload: NormalizedSepayPayload;
  sbAdmin: SepayAdminClient;
  wsId: string;
}) {
  const { data: categories, error } = await input.sbAdmin
    .from('transaction_categories')
    .select('id, name, is_expense, icon, color')
    .eq('ws_id', input.wsId)
    .eq('is_expense', input.isExpense);

  if (error) {
    throw new Error('Failed to load candidate transaction categories');
  }

  const candidateCategories = (categories ?? []) as Array<{
    color: string | null;
    icon: string | null;
    id: string;
    is_expense: boolean | null;
    name: string;
  }>;

  const fallbackCategoryId = await ensureFallbackCategory({
    isExpense: input.isExpense,
    sbAdmin: input.sbAdmin,
    wsId: input.wsId,
  });

  if (candidateCategories.length === 0) {
    return {
      categoryId: fallbackCategoryId,
      confidence: 0,
      reason: 'No matching direction categories found, used fallback category.',
    };
  }

  const classification = await runSepayAiEnrichment({
    execute: (abortSignal) =>
      generateObject({
        abortSignal,
        model: google(CLASSIFIER_MODEL),
        output: 'object',
        schema: classifierResultSchema,
        prompt: [
          'Select the best matching transaction category from the candidate list.',
          'Choose only one category ID from the list and provide confidence from 0 to 1.',
          'Favor semantic meaning in content, description, code, and reference code.',
          '',
          `Direction: ${input.payload.transferType === 'in' ? 'income' : 'expense'}`,
          `Amount: ${input.payload.transferAmount}`,
          `Gateway: ${input.payload.gateway ?? ''}`,
          `Content: ${input.payload.content ?? ''}`,
          `Description: ${input.payload.description ?? ''}`,
          `Code: ${input.payload.code ?? ''}`,
          `Reference Code: ${input.payload.referenceCode ?? ''}`,
          '',
          `Candidates: ${JSON.stringify(
            candidateCategories.map((category) => ({
              color: category.color,
              icon: category.icon,
              id: category.id,
              name: category.name,
            }))
          )}`,
        ].join('\n'),
      }),
    kind: 'classifier',
    modelId: CLASSIFIER_MODEL,
    payload: input.payload,
    sbAdmin: input.sbAdmin,
    timeoutMs: CLASSIFIER_TIMEOUT_MS,
    wsId: input.wsId,
  });

  if (!classification) {
    return {
      categoryId: fallbackCategoryId,
      confidence: 0,
      reason: 'Classifier failed, used fallback category.',
    };
  }

  try {
    const pickedCategoryId = classification.object.categoryId;
    const pickedConfidence = classification.object.confidence;
    const pickedReason = classification.object.reason;

    const existsInCandidates = candidateCategories.some(
      (category) => category.id === pickedCategoryId
    );

    if (!existsInCandidates) {
      return {
        categoryId: fallbackCategoryId,
        confidence: pickedConfidence,
        reason:
          'Classifier returned a category outside the candidate list, used fallback category.',
      };
    }

    if (pickedConfidence < CATEGORY_CONFIDENCE_THRESHOLD) {
      return {
        categoryId: fallbackCategoryId,
        confidence: pickedConfidence,
        reason:
          pickedReason ||
          'Classifier confidence below threshold, used fallback category.',
      };
    }

    return {
      categoryId: pickedCategoryId,
      confidence: pickedConfidence,
      reason: pickedReason,
    };
  } catch {
    return {
      categoryId: fallbackCategoryId,
      confidence: 0,
      reason: 'Classifier failed, used fallback category.',
    };
  }
}
