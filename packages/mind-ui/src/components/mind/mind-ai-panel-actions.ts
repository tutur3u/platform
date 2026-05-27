import type { MindAiPatchRecord, MindBoardSnapshot } from '@tuturuuu/types/db';

export type MindAiFinishInvalidationScope = 'graph' | 'patches';

export function mergeMindPatchRecord(
  patches: MindAiPatchRecord[] | undefined,
  patch: MindAiPatchRecord
) {
  const current = patches ?? [];
  const index = current.findIndex((item) => item.id === patch.id);

  if (index === -1) return [patch, ...current];

  return current.map((item) => (item.id === patch.id ? patch : item));
}

export function getMindAiFinishInvalidationScopes({
  directWrite,
}: {
  directWrite: boolean;
}): MindAiFinishInvalidationScope[] {
  return directWrite ? ['graph', 'patches'] : ['patches'];
}

export async function applyMindPatchWithLayoutRefresh({
  applyPatch,
  boardId,
  onPatchApplied,
  organizeAndSaveBoard,
  patchId,
  refreshBoardSnapshot,
}: {
  applyPatch: (patchId: string) => Promise<{ patch: MindAiPatchRecord }>;
  boardId?: string | null;
  onPatchApplied: (patch: MindAiPatchRecord) => void;
  organizeAndSaveBoard: (boardId: string) => Promise<MindBoardSnapshot>;
  patchId: string;
  refreshBoardSnapshot?: (boardId: string) => Promise<MindBoardSnapshot>;
}): Promise<{
  layoutError: Error | null;
  patch: MindAiPatchRecord;
  snapshot: MindBoardSnapshot | null;
}> {
  const response = await applyPatch(patchId);
  onPatchApplied(response.patch);

  const targetBoardId = response.patch.boardId || boardId;
  if (!targetBoardId) {
    return {
      layoutError: null,
      patch: response.patch,
      snapshot: null,
    };
  }

  try {
    return {
      layoutError: null,
      patch: response.patch,
      snapshot: await organizeAndSaveBoard(targetBoardId),
    };
  } catch (error) {
    const snapshot = refreshBoardSnapshot
      ? await refreshBoardSnapshot(targetBoardId).catch(() => null)
      : null;

    return {
      layoutError:
        error instanceof Error ? error : new Error('Layout refresh failed'),
      patch: response.patch,
      snapshot,
    };
  }
}
