'use server';

import {
  authorizeDraft,
  type DraftResult,
  writeDraft,
} from '@/lib/worlds/draft-store';

export async function saveWorldDraft(
  wsId: string,
  input: unknown
): Promise<DraftResult> {
  const authorizedId = await authorizeDraft(wsId);
  if (!authorizedId) return { status: 'forbidden' };
  return writeDraft(authorizedId, input);
}
