'use client';

import { Button } from '@tuturuuu/ui/button';
import { useCitationContext } from './citation-context';
import type { CitationChoice } from './citation-source-card';
import { RepairProposalDetails, RepairStatus } from './repair-status';
import type { CitationRepairAdapter } from './types';
import { useRepairFlow } from './use-repair-flow';

export const rawRepairSessionKey = (input: string) => `raw:${input}`;

interface Props {
  /** The exact pasted reference; mount with `key` set to its session key. */
  input: string;
  repair: CitationRepairAdapter & {
    runRaw: NonNullable<CitationRepairAdapter['runRaw']>;
  };
  isValid: (work: unknown) => boolean;
  /** Cites without saving; nothing is inserted until the person chooses. */
  onCite: (choice: CitationChoice) => void;
  /** Saves to the library, then cites; `onSaved` runs only on success. */
  onSaveAndCite?: (work: unknown, onSaved: () => void) => void;
}

/**
 * One-reference AI repair of pasted text before insertion. The same raw input
 * and operation id survive closing the drawer; the proposal is reviewed and
 * then cited or saved explicitly.
 */
export function CitationRawRepair({
  input,
  repair,
  isValid,
  onCite,
  onSaveAndCite,
}: Props) {
  const context = useCitationContext();
  const flow = useRepairFlow({
    sessionKey: rawRepairSessionKey(input),
    createOperationId: repair.createOperationId,
    run: (operationId) => repair.runRaw(input, operationId),
  });
  if (!context) return null;
  const { labels, rawRepairInput } = context;

  const finish = () => {
    if (rawRepairInput.current === input) rawRepairInput.current = null;
    flow.settle();
  };

  if (flow.view.kind !== 'review') {
    return (
      <RepairStatus
        flow={{
          ...flow,
          request: () => {
            rawRepairInput.current = input;
            flow.request();
          },
        }}
        labels={labels}
        triggerLabel={labels.repairRaw}
      />
    );
  }

  const { proposal } = flow.view;
  const valid = isValid(proposal.work);
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <RepairProposalDetails proposal={proposal} labels={labels} />
      {!valid && (
        <p className="text-destructive text-xs">{labels.invalidWork}</p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={finish}>
          {labels.discard}
        </Button>
        {onSaveAndCite && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!valid}
            onClick={() => onSaveAndCite(proposal.work, finish)}
          >
            {labels.saveAndUse}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          disabled={!valid}
          onClick={() => {
            finish();
            onCite({ itemId: null, work: proposal.work, libraryVersion: null });
          }}
        >
          {labels.useSource}
        </Button>
      </div>
    </div>
  );
}
