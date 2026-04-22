import { google } from '@ai-sdk/google';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { generateObject } from 'ai';
import { z } from 'zod';
import type { NormalizedSepayPayload } from './schemas';

type SepayAdminClient = TypedSupabaseClient;

const TAGGER_MODEL = 'gemini-3.1-flash-lite-preview';

const taggerResultSchema = z.object({
  tagIds: z.array(z.guid()),
  reasons: z.array(z.string().trim().max(200)),
});

export async function classifyTagIds(input: {
  payload: NormalizedSepayPayload;
  sbAdmin: SepayAdminClient;
  wsId: string;
}): Promise<{
  tagIds: string[];
  reasons: string[];
}> {
  const { data: tags, error } = await input.sbAdmin
    .from('transaction_tags')
    .select('id, name, color, description')
    .eq('ws_id', input.wsId);

  if (error) {
    throw new Error('Failed to load candidate transaction tags');
  }

  const candidateTags = (tags ?? []) as Array<{
    color: string;
    description: string | null;
    id: string;
    name: string;
  }>;

  if (candidateTags.length === 0) {
    return {
      tagIds: [],
      reasons: [],
    };
  }

  try {
    const classification = await generateObject({
      model: google(TAGGER_MODEL),
      output: 'object',
      schema: taggerResultSchema,
      prompt: [
        'Select the most relevant transaction tags from the candidate list for this transaction.',
        'Choose zero or more tag IDs from the list. Only select tags that are highly relevant.',
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
          candidateTags.map((tag) => ({
            id: tag.id,
            name: tag.name,
            color: tag.color,
            description: tag.description,
          }))
        )}`,
      ].join('\n'),
    });

    const pickedTagIds = classification.object.tagIds;
    const pickedReasons = classification.object.reasons;

    // Filter to only include valid tag IDs that exist in candidates
    const validTagIds = [...new Set(pickedTagIds)].filter((id) =>
      candidateTags.some((tag) => tag.id === id)
    );

    return {
      tagIds: validTagIds,
      reasons: pickedReasons.slice(0, validTagIds.length),
    };
  } catch {
    return {
      tagIds: [],
      reasons: [],
    };
  }
}
