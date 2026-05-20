'use client';

import type { MindBoardSnapshotResponse } from '@tuturuuu/internal-api/mind';
import { MindAiPatchDraftCard } from './mind-ai-patch-draft-card';

type Props = {
  applying?: boolean;
  patches: MindBoardSnapshotResponse['patches'];
  onApplyPatch: (patchId: string) => void;
};

export function MindAiPatchList({ applying, patches, onApplyPatch }: Props) {
  const proposedPatches = patches.filter((patch) => patch.status === 'draft');

  return (
    <>
      {proposedPatches.map((patch) => (
        <MindAiPatchDraftCard
          applying={applying}
          key={patch.id}
          onApplyPatch={onApplyPatch}
          patch={patch}
        />
      ))}
    </>
  );
}
