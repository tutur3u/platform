'use client';

import { useMutation } from '@tanstack/react-query';
import { Loader2, PencilLine } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { type FormEvent, useId, useState } from 'react';
import { useCitationContext } from './citation-context';
import { CitationRawRepair, rawRepairSessionKey } from './citation-raw-repair';
import {
  type CitationChoice,
  CitationSourceCard,
} from './citation-source-card';
import type { CitationLabels } from './labels';
import type {
  CitationAdapter,
  CitationCandidate,
  CitationCapture,
  CitationResult,
} from './types';

interface Props {
  adapter: CitationAdapter;
  labels: CitationLabels;
  isValid: (work: unknown) => boolean;
  onChoose: (choice: CitationChoice) => void;
}

type CaptureRequest = { mode: 'identifier' | 'title'; input: string };
type SaveRequest = {
  work: unknown;
  choose: (choice: CitationChoice) => void;
};

type CaptureView =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | {
      kind: 'failed';
      result: Exclude<CitationResult<unknown>, { status: 'ok' }> | null;
    }
  | CitationCapture;

export function CitationCaptureTab({
  adapter,
  labels,
  isValid,
  onChoose,
}: Props) {
  const inputId = useId();
  const context = useCitationContext();
  // A raw repair still open from an earlier drawer session resumes its input.
  const [input, setInput] = useState(
    () => context?.rawRepairInput.current ?? ''
  );
  const [manualDraft, setManualDraft] = useState<{ draft: unknown } | null>(
    null
  );
  const capture = adapter.capture;

  const lookup = useMutation({
    mutationFn: ({ mode, input }: CaptureRequest) => {
      if (!capture) throw new Error('Citation capture adapter missing');
      if (mode === 'title' && capture.searchTitle) {
        return capture.searchTitle(input);
      }
      return capture.lookup(input);
    },
    retry: false,
  });

  // The save carries the `onChoose` of the drawer session it started in. The
  // layer fences that session, so a save that lands after another choice, a
  // close or a reopen still persists to the library but never edits the doc.
  const save = useMutation({
    mutationFn: ({ work }: SaveRequest) => {
      if (!adapter.library) throw new Error('Citation library adapter missing');
      return adapter.library.save(work);
    },
    retry: false,
    onSuccess: (result, { choose }) => {
      if (result.status !== 'ok') return;
      choose({
        itemId: result.data.id,
        work: result.data.work,
        libraryVersion: result.data.version,
      });
    },
  });
  const saving = save.isPending;

  if (manualDraft && adapter.renderManualEditor) {
    return adapter.renderManualEditor({
      draft: manualDraft.draft,
      onSubmit: (work) =>
        onChoose({ itemId: null, work, libraryVersion: null }),
      onCancel: () => setManualDraft(null),
    });
  }

  const view: CaptureView = lookup.isPending
    ? { kind: 'pending' }
    : lookup.isError
      ? { kind: 'failed', result: null }
      : lookup.data
        ? lookup.data.status === 'ok'
          ? lookup.data.data
          : { kind: 'failed', result: lookup.data }
        : { kind: 'idle' };

  const submit = (mode: CaptureRequest['mode']) => (event?: FormEvent) => {
    event?.preventDefault();
    const value = input.trim();
    if (!value || lookup.isPending || saving) return;
    save.reset();
    lookup.mutate({ mode, input: value });
  };

  const runRaw = adapter.repair?.runRaw;
  const resumedRaw = context?.rawRepairInput.current ?? null;
  const rawInput =
    view.kind === 'failed' || view.kind === 'manual'
      ? (lookup.variables?.input ?? null)
      : view.kind === 'idle' && resumedRaw && resumedRaw === input.trim()
        ? resumedRaw
        : null;
  const rawRepair =
    adapter.repair && runRaw && rawInput ? (
      <CitationRawRepair
        key={rawRepairSessionKey(rawInput)}
        input={rawInput}
        repair={{ ...adapter.repair, runRaw }}
        isValid={isValid}
        onCite={onChoose}
        onSaveAndCite={
          adapter.library
            ? (work, onSaved) =>
                save.mutate({
                  work,
                  choose: (choice) => {
                    onSaved();
                    onChoose(choice);
                  },
                })
            : undefined
        }
      />
    ) : null;

  const card = (candidate: CitationCandidate) => (
    <CitationSourceCard
      summary={candidate.summary}
      labels={labels}
      valid={isValid(candidate.work)}
      saving={saving && save.variables?.work === candidate.work}
      onCite={() =>
        onChoose({ itemId: null, work: candidate.work, libraryVersion: null })
      }
      onSaveAndCite={
        adapter.library
          ? () => save.mutate({ work: candidate.work, choose: onChoose })
          : undefined
      }
    />
  );

  const saveFailure =
    save.isError || (save.data && save.data.status !== 'ok') ? (
      <p role="alert" className="text-destructive text-xs">
        {save.data?.status === 'unavailable'
          ? labels.unavailable[save.data.reason]
          : labels.errorGeneric}
      </p>
    ) : null;

  const result = (() => {
    switch (view.kind) {
      case 'idle':
      case 'pending':
        return null;
      case 'failed':
        return (
          <p role="alert" className="text-destructive text-sm">
            {view.result?.status === 'unavailable'
              ? labels.unavailable[view.result.reason]
              : labels.errorGeneric}
          </p>
        );
      case 'captured':
        return (
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground text-xs">{labels.reviewHint}</p>
            {card(view.candidate)}
            {saveFailure}
          </div>
        );
      case 'candidates':
        return (
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground text-xs">
              {labels.candidatesHint}
            </p>
            <ul className="flex flex-col gap-2">
              {view.candidates.slice(0, 3).map((candidate, index) => (
                <li key={index}>{card(candidate)}</li>
              ))}
            </ul>
            {saveFailure}
          </div>
        );
      case 'manual':
        return (
          <div className="flex flex-col items-start gap-2">
            <p className="text-muted-foreground text-sm">
              {labels.invalidWork}
            </p>
            {adapter.renderManualEditor && (
              <Button
                type="button"
                size="sm"
                onClick={() => setManualDraft({ draft: view.draft })}
              >
                <PencilLine className="size-4" aria-hidden="true" />
                {labels.completeManually}
              </Button>
            )}
          </div>
        );
      default: {
        const exhaustive: never = view;
        return exhaustive;
      }
    }
  })();

  return (
    <div className="flex flex-col gap-4">
      {capture ? (
        <form className="flex flex-col gap-2" onSubmit={submit('identifier')}>
          <Label htmlFor={inputId}>{labels.captureInput}</Label>
          <Input
            id={inputId}
            value={input}
            placeholder={labels.capturePlaceholder}
            autoComplete="off"
            onChange={(event) => setInput(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={!input.trim() || lookup.isPending || saving}
            >
              {lookup.isPending && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              {labels.captureSubmit}
            </Button>
            {capture.searchTitle && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!input.trim() || lookup.isPending || saving}
                onClick={() => submit('title')()}
              >
                {labels.titleSearch}
              </Button>
            )}
          </div>
        </form>
      ) : (
        <p className="text-muted-foreground text-sm">
          {labels.unavailable.not_provisioned}
        </p>
      )}
      {/* A pending save locks every competing choice until it settles. */}
      <fieldset
        disabled={saving}
        aria-busy={saving || undefined}
        className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0"
      >
        <div aria-live="polite" className="flex flex-col gap-3">
          {result}
          {rawRepair}
          {rawRepair && saveFailure}
        </div>
        {adapter.renderManualEditor && view.kind !== 'manual' && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => setManualDraft({ draft: null })}
          >
            <PencilLine className="size-4" aria-hidden="true" />
            {labels.manualEntry}
          </Button>
        )}
      </fieldset>
    </div>
  );
}
