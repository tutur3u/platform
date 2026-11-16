'use client';

import { Loader2, Sparkles } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import type { CitationLabels } from './labels';
import type { CitationRepair } from './types';
import type { RepairFlow } from './use-repair-flow';

/**
 * Every repair state except review: the trigger, the personal-credit
 * confirmation, progress, truthful billing failures and the stale notice.
 */
export function RepairStatus({
  flow,
  labels,
  triggerLabel,
}: {
  flow: RepairFlow;
  labels: CitationLabels;
  triggerLabel?: string;
}) {
  const { view } = flow;
  switch (view.kind) {
    case 'review':
      return null;
    case 'pending':
      return (
        <Button type="button" variant="outline" size="sm" disabled>
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {labels.repairing}
        </Button>
      );
    case 'confirm':
      return (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <p className="text-xs">{labels.repairConfirm}</p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={flow.cancel}
            >
              {labels.cancel}
            </Button>
            <Button type="button" size="sm" onClick={flow.start}>
              {labels.repairContinue}
            </Button>
          </div>
        </div>
      );
    case 'failed': {
      const { failure } = view;
      const checking =
        failure.kind === 'billingPending' || failure.kind === 'inProgress';
      return (
        <div className="flex flex-col gap-2" role="alert">
          <p
            className={
              checking
                ? 'text-muted-foreground text-xs'
                : 'text-destructive text-xs'
            }
          >
            {labels.repairFailure[failure.kind]}
          </p>
          {failure.retry !== 'none' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={failure.retry === 'same' ? flow.start : flow.request}
            >
              {failure.retry === 'new'
                ? labels.repairTryAgain
                : checking
                  ? labels.repairCheckAgain
                  : labels.retry}
            </Button>
          )}
        </div>
      );
    }
    case 'stale':
      return (
        <p role="status" className="text-muted-foreground text-xs">
          {labels.repairStale}
        </p>
      );
    case 'idle':
      return (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={flow.request}
        >
          <Sparkles className="size-4" aria-hidden="true" />
          {triggerLabel ?? labels.repair}
        </Button>
      );
    default: {
      const exhaustive: never = view;
      return exhaustive;
    }
  }
}

/** Proposed source with its uncertain fields and the credits actually charged. */
export function RepairProposalDetails({
  proposal,
  labels,
}: {
  proposal: CitationRepair;
  labels: CitationLabels;
}) {
  return (
    <>
      <p className="text-muted-foreground text-xs">{labels.repairReview}</p>
      <p className="font-medium text-sm">
        {proposal.summary.title || labels.untitled}
      </p>
      {(proposal.summary.contributors || proposal.summary.year) && (
        <p className="text-muted-foreground text-xs">
          {[proposal.summary.contributors, proposal.summary.year]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      {proposal.uncertainFields.length > 0 && (
        <p className="text-xs">
          <span className="text-muted-foreground">
            {labels.uncertainFields}:{' '}
          </span>
          {proposal.uncertainFields.join(', ')}
        </p>
      )}
      {typeof proposal.creditsDeducted === 'number' && (
        <p className="text-muted-foreground text-xs">
          {labels.repairCharged(proposal.creditsDeducted)}
        </p>
      )}
    </>
  );
}
