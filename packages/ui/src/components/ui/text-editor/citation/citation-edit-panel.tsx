'use client';

import { RefreshCw, Replace, Trash2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Switch } from '@tuturuuu/ui/switch';
import { useId, useState } from 'react';
import { useCitationContext } from './citation-context';
import { CitationRepairSection } from './citation-repair-section';
import { citationIssueField } from './label-keys';
import { citationSnapshotKey, normalizeLocator } from './snapshot';
import {
  CITATION_LOCATOR_LABELS,
  type CitationLocatorLabel,
  type CitationNodeAttrs,
  type CitationRecovery,
  type CitationSnapshotInspection,
} from './types';

const NO_LOCATOR = 'none';

interface Props {
  attrs: Omit<CitationNodeAttrs, 'citationId'> & { citationId: string | null };
  inspection: CitationSnapshotInspection | null;
  recovery: CitationRecovery;
  onUpdate: (patch: Partial<CitationNodeAttrs>) => void;
  onRemove: () => void;
  onReplace: () => void;
}

export function recoveryLabelKey(kind: CitationRecovery['kind']) {
  switch (kind) {
    case 'invalid':
      return 'invalid';
    case 'unlinked':
      return 'unlinked';
    case 'checking':
      return 'checking';
    case 'linked':
      return 'linked';
    case 'update-available':
      return 'updateAvailable';
    case 'detached':
      return 'detached';
    case 'library-unavailable':
      return 'libraryUnavailable';
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

export function CitationEditPanel({
  attrs,
  inspection,
  recovery,
  onUpdate,
  onRemove,
  onReplace,
}: Props) {
  const context = useCitationContext();
  const ids = { label: useId(), value: useId(), suppress: useId() };
  const [locatorLabel, setLocatorLabel] = useState<
    CitationLocatorLabel | typeof NO_LOCATOR
  >(attrs.locator?.label ?? NO_LOCATOR);
  const [locatorValue, setLocatorValue] = useState(attrs.locator?.value ?? '');
  if (!context) return null;
  const { labels, adapter } = context;
  const summary = inspection?.summary;

  const commitLocator = (
    label: CitationLocatorLabel | typeof NO_LOCATOR,
    value: string
  ) => {
    onUpdate({
      locator: label === NO_LOCATOR ? null : normalizeLocator({ label, value }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="line-clamp-2 font-medium text-sm">
          {summary?.title || labels.untitled}
        </p>
        {summary && (summary.contributors || summary.year) && (
          <p className="text-muted-foreground text-xs">
            {[summary.contributors, summary.year].filter(Boolean).join(' · ')}
          </p>
        )}
        <p
          className={
            recovery.kind === 'invalid'
              ? 'text-destructive text-xs'
              : 'text-muted-foreground text-xs'
          }
        >
          {labels.status[recoveryLabelKey(recovery.kind)]}
        </p>
      </div>

      {inspection?.status === 'valid' && inspection.issues.length > 0 && (
        <div className="flex flex-col gap-1" role="status">
          <p className="font-medium text-xs">{labels.issuesHeading}</p>
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {inspection.issues.map((issue) => (
              <li
                key={`${issue.severity}:${issue.field}`}
                className="flex items-baseline justify-between gap-2 text-xs"
              >
                <span>
                  {labels.issueFields[citationIssueField(issue.field)]}
                </span>
                <span
                  className={
                    issue.severity === 'error'
                      ? 'text-dynamic-orange'
                      : 'text-muted-foreground'
                  }
                >
                  {issue.severity === 'error'
                    ? labels.issueRequired
                    : labels.issueRecommended}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.label}>{labels.locator}</Label>
          <Select
            value={locatorLabel}
            onValueChange={(value) => {
              const next = value as CitationLocatorLabel | typeof NO_LOCATOR;
              setLocatorLabel(next);
              commitLocator(next, locatorValue);
            }}
          >
            <SelectTrigger id={ids.label} className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_LOCATOR}>{labels.locatorNone}</SelectItem>
              {CITATION_LOCATOR_LABELS.map((label) => (
                <SelectItem key={label} value={label}>
                  {labels.locatorLabels[label]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.value}>{labels.locatorValue}</Label>
          <Input
            id={ids.value}
            className="h-9"
            value={locatorValue}
            maxLength={40}
            disabled={locatorLabel === NO_LOCATOR}
            onChange={(event) => setLocatorValue(event.target.value)}
            onBlur={() => commitLocator(locatorLabel, locatorValue)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitLocator(locatorLabel, locatorValue);
              }
            }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={ids.suppress}>{labels.suppressAuthor}</Label>
        <Switch
          id={ids.suppress}
          checked={attrs.suppressAuthor}
          onCheckedChange={(checked) => onUpdate({ suppressAuthor: checked })}
        />
      </div>

      {recovery.kind === 'update-available' && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const snapshot = adapter.createSnapshot(
              recovery.item.work,
              recovery.item.version
            );
            if (snapshot) onUpdate({ snapshot });
          }}
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          {labels.updateFromLibrary}
        </Button>
      )}

      {adapter.repair && attrs.snapshot && attrs.citationId && (
        <CitationRepairSection
          key={citationSnapshotKey(attrs.snapshot)}
          citationId={attrs.citationId}
          snapshot={attrs.snapshot}
          repair={adapter.repair}
        />
      )}

      <div className="flex flex-wrap justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onReplace}>
          <Replace className="size-4" aria-hidden="true" />
          {labels.replace}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="size-4" aria-hidden="true" />
          {labels.remove}
        </Button>
      </div>
    </div>
  );
}
