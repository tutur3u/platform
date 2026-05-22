import type { MindAiPatchRecord, MindBoardSnapshot } from '@tuturuuu/types/db';
import { describe, expect, it, vi } from 'vitest';
import {
  applyMindPatchWithLayoutRefresh,
  getMindAiFinishInvalidationScopes,
  mergeMindPatchRecord,
} from './mind-ai-panel-actions';

describe('Mind AI panel actions', () => {
  it('updates cached patch records so drafts render as applied immediately', () => {
    const draft = patchRecord({ status: 'draft' });
    const applied = patchRecord({
      appliedAt: '2026-05-22T12:00:00.000Z',
      status: 'applied',
    });

    expect(mergeMindPatchRecord([draft], applied)).toEqual([applied]);
    expect(mergeMindPatchRecord([], applied)).toEqual([applied]);
  });

  it('invalidates only patches after draft-mode AI finishes', () => {
    expect(getMindAiFinishInvalidationScopes({ directWrite: false })).toEqual([
      'patches',
    ]);
    expect(getMindAiFinishInvalidationScopes({ directWrite: true })).toEqual([
      'graph',
      'patches',
    ]);
  });

  it('keeps an applied patch when auto-layout refresh fails', async () => {
    const applied = patchRecord({
      appliedAt: '2026-05-22T12:00:00.000Z',
      status: 'applied',
    });
    const layoutError = new Error('Layout save failed');
    const onPatchApplied = vi.fn();

    const result = await applyMindPatchWithLayoutRefresh({
      applyPatch: async () => ({ patch: applied }),
      boardId: BOARD_ID,
      onPatchApplied,
      organizeAndSaveBoard: async () => {
        throw layoutError;
      },
      patchId: applied.id,
    });

    expect(onPatchApplied).toHaveBeenCalledWith(applied);
    expect(result.patch).toBe(applied);
    expect(result.layoutError).toBe(layoutError);
    expect(result.snapshot).toBeNull();
  });

  it('returns the organized snapshot after a successful layout refresh', async () => {
    const applied = patchRecord({
      appliedAt: '2026-05-22T12:00:00.000Z',
      status: 'applied',
    });
    const onPatchApplied = vi.fn();

    const result = await applyMindPatchWithLayoutRefresh({
      applyPatch: async () => ({ patch: applied }),
      boardId: BOARD_ID,
      onPatchApplied,
      organizeAndSaveBoard: async () => snapshot,
      patchId: applied.id,
    });

    expect(onPatchApplied).toHaveBeenCalledWith(applied);
    expect(result.layoutError).toBeNull();
    expect(result.snapshot).toBe(snapshot);
  });
});

function patchRecord(
  patch: Partial<MindAiPatchRecord> & Pick<MindAiPatchRecord, 'status'>
): MindAiPatchRecord {
  return {
    appliedAt: null,
    boardId: BOARD_ID,
    createdAt: '2026-05-22T00:00:00.000Z',
    createdBy: 'user-1',
    id: PATCH_ID,
    patch: {
      operations: [],
      summary: 'Apply roadmap relationships',
    },
    summary: 'Apply roadmap relationships',
    threadId: 'thread-1',
    ...patch,
  };
}

const BOARD_ID = 'board-1';
const PATCH_ID = 'patch-1';

const snapshot: MindBoardSnapshot = {
  board: {
    canvasView: null,
    createdAt: '2026-05-22T00:00:00.000Z',
    defaultHorizon: 'year',
    description: null,
    edgeCount: 0,
    id: BOARD_ID,
    nodeCount: 0,
    settings: {},
    status: 'active',
    tagCount: 0,
    title: 'Roadmap',
    updatedAt: '2026-05-22T00:00:00.000Z',
    wsId: 'ws-1',
  },
  edges: [],
  groups: [],
  links: [],
  nodes: [],
  tags: [],
};
