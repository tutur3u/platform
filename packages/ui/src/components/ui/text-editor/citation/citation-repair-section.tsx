'use client';

import { Button } from '@tuturuuu/ui/button';
import { applyRepairedSnapshot } from './citation-commands';
import { useCitationContext } from './citation-context';
import { RepairProposalDetails, RepairStatus } from './repair-status';
import { citationSnapshotKey } from './snapshot';
import type {
  CitationRepair,
  CitationRepairAdapter,
  CitationSnapshot,
} from './types';
import { useRepairFlow } from './use-repair-flow';

interface Props {
  citationId: string;
  /** The exact stored snapshot; mount with `key` set to its snapshot key. */
  snapshot: CitationSnapshot;
  repair: CitationRepairAdapter;
}

/**
 * Repair of a placed citation. The proposal is applied only while the citation
 * still holds the snapshot it was computed from.
 */
export function CitationRepairSection({ citationId, snapshot, repair }: Props) {
  const context = useCitationContext();
  const baseKey = citationSnapshotKey(snapshot);
  const flow = useRepairFlow({
    sessionKey: baseKey,
    createOperationId: repair.createOperationId,
    run: (operationId) => repair.run(snapshot, operationId),
  });
  if (!context) return null;
  const { labels, adapter, editor } = context;

  const apply = (proposal: CitationRepair) => {
    const next = adapter.createSnapshot(
      proposal.work,
      snapshot.kind === 'cite-work' ? snapshot.libraryVersion : null
    );
    if (!next) {
      flow.settle({
        kind: 'failed',
        failure: { kind: 'chargedInvalid', retry: 'new' },
      });
      return;
    }
    const applied = applyRepairedSnapshot(editor, citationId, baseKey, next);
    flow.settle(applied ? { kind: 'idle' } : { kind: 'stale' });
  };

  if (flow.view.kind !== 'review') {
    return <RepairStatus flow={flow} labels={labels} />;
  }
  const { proposal } = flow.view;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <RepairProposalDetails proposal={proposal} labels={labels} />
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => flow.settle()}
        >
          {labels.discard}
        </Button>
        <Button type="button" size="sm" onClick={() => apply(proposal)}>
          {labels.applyRepair}
        </Button>
      </div>
    </div>
  );
}
