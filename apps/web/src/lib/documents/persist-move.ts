import type { DocumentMove, MoveResult } from './hierarchy';

export async function persistDocumentMove({
  id,
  result,
  canManage,
  update,
}: {
  id: string;
  result: MoveResult;
  canManage: boolean;
  update: (id: string, move: Partial<DocumentMove>) => Promise<unknown>;
}): Promise<'saved' | 'denied' | 'unknown'> {
  if (!canManage || result.kind === 'denied') return 'denied';
  try {
    for (const item of result.preparation ?? []) {
      await update(item.id, { position: item.position });
    }
    await update(id, result.move);
    return 'saved';
  } catch {
    return 'unknown';
  }
}
