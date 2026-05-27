'use client';

import type { MindBoardSnapshotResponse } from '@tuturuuu/internal-api/mind';
import type { MindNode } from '@tuturuuu/types/db';
import { MindAiPatchDraftCard } from './mind-ai-patch-draft-card';

type Props = {
  applying?: boolean;
  nodes?: Pick<MindNode, 'id' | 'title'>[];
  patches: MindBoardSnapshotResponse['patches'];
  onApplyPatch: (patchId: string) => void;
};

export function MindAiPatchList({
  applying,
  nodes = [],
  patches,
  onApplyPatch,
}: Props) {
  const proposedPatches = patches.filter((patch) => patch.status === 'draft');

  return (
    <>
      {proposedPatches.map((patch) => (
        <MindAiPatchDraftCard
          applying={applying}
          key={patch.id}
          nodes={nodes}
          onApplyPatch={onApplyPatch}
          patch={patch}
        />
      ))}
    </>
  );
}
