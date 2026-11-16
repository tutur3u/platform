'use client';

import { Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import type { ReactNode } from 'react';
import type { CitationLabels } from './labels';
import type { CitationWorkSummary } from './types';

/** A chosen source, before it is wrapped in a snapshot by the layer. */
export interface CitationChoice {
  itemId: string | null;
  work: unknown;
  libraryVersion: number | null;
}

interface Props {
  summary: CitationWorkSummary;
  labels: CitationLabels;
  /** False when the host cannot build a snapshot from this work. */
  valid: boolean;
  onCite: () => void;
  onSaveAndCite?: () => void;
  saving?: boolean;
  /** Secondary item actions (edit, delete), placed before the cite actions. */
  actions?: ReactNode;
}

export function CitationSourceCard({
  summary,
  labels,
  valid,
  onCite,
  onSaveAndCite,
  saving = false,
  actions,
}: Props) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <p className="line-clamp-3 font-medium text-sm">
        {summary.title || labels.untitled}
      </p>
      {(summary.contributors || summary.year) && (
        <p className="text-muted-foreground text-xs">
          {[summary.contributors, summary.year].filter(Boolean).join(' · ')}
        </p>
      )}
      {!valid && (
        <p className="text-destructive text-xs">{labels.invalidWork}</p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {actions && <div className="mr-auto flex gap-1">{actions}</div>}
        {onSaveAndCite && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!valid || saving}
            onClick={onSaveAndCite}
          >
            {saving && (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            )}
            {labels.saveAndUse}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          disabled={!valid || saving}
          onClick={onCite}
        >
          {labels.useSource}
        </Button>
      </div>
    </div>
  );
}
