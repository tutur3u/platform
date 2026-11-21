import { fleetIntentInputSchema } from '@tuturuuu/internal-api/fleet';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { type FormEvent, useState } from 'react';
import { toneBadge } from '../components/tone';
import { ChoiceField, TextField } from './fields';
import {
  draftToInput,
  type FieldErrors,
  type FieldName,
  fieldErrors,
  type IntentKind,
  intentFields,
  type RequestDraft,
  type RequestOption,
} from './model';
import { Panel } from './query-message';
import { useSubmitFleetIntent } from './queries';
import { useFleetText } from './text';
import type { FleetRefusal } from './upstream';

type SubmitState =
  | { kind: 'editing' }
  | { kind: 'submitting' }
  | { kind: 'filed' }
  | { kind: 'refused'; reason: FleetRefusal };

function emptyDraft(kind: IntentKind, projectKey: string): RequestDraft {
  return {
    kind,
    projectKey,
    targetKey: '',
    choice: intentFields[kind].choice?.options[0] ?? '',
    commitSha: '',
    quote: '',
  };
}

export function RequestForm({
  options,
  projects,
}: {
  options: RequestOption[];
  projects: string[];
}) {
  const { t } = useFleetText();
  const first = options[0] as RequestOption;
  const [draft, setDraft] = useState(() =>
    emptyDraft(first.kind, projects[0] ?? '')
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const mutation = useSubmitFleetIntent();
  const spec = intentFields[draft.kind];
  const choice = spec.choice;
  const choiceLabels: Record<string, string> = choice
    ? t.choice[choice.field]
    : {};
  const option = options.find(({ kind }) => kind === draft.kind) ?? first;
  const state = submitState(mutation);

  const edit = (patch: Partial<RequestDraft>) => {
    if (state.kind !== 'editing') mutation.reset();
    setDraft((current) =>
      patch.kind && patch.kind !== current.kind
        ? {
            ...emptyDraft(patch.kind, current.projectKey),
            quote: current.quote,
          }
        : { ...current, ...patch }
    );
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = fieldErrors(draft);
    setErrors(found ?? {});
    if (found) return;
    const input = fleetIntentInputSchema.parse(draftToInput(draft));
    mutation.mutate(input, {
      onSuccess: (result) => {
        if (result.kind === 'ok')
          setDraft(emptyDraft(draft.kind, draft.projectKey));
      },
    });
  };

  const message = (field: FieldName) => {
    const code = errors[field];
    return code ? t.requests[code] : undefined;
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-base tracking-tight">
          {t.requests.new}
        </h2>
        {option.ownerApproval && (
          <Badge variant="outline" className={toneBadge('yellow')}>
            {t.requests.ownerApproval}
          </Badge>
        )}
      </div>
      <Panel>
        <form onSubmit={submit} noValidate>
          <div className="grid gap-4 px-4 py-4 sm:grid-cols-2 md:px-5">
            <ChoiceField
              id="fleet-request-kind"
              label={t.field.kind}
              value={draft.kind}
              options={options.map(({ kind }) => ({
                value: kind,
                label: t.kind[kind],
              }))}
              onChange={(kind) => edit({ kind })}
            />
            <ChoiceField
              id="fleet-request-project"
              label={t.field.project}
              error={message('projectKey')}
              value={draft.projectKey}
              options={projects.map((key) => ({ value: key, label: key }))}
              onChange={(projectKey) => edit({ projectKey })}
            />
            {spec.target && (
              <TextField
                id="fleet-request-target"
                label={t.field.target}
                error={message('targetKey')}
                value={draft.targetKey}
                mono
                onChange={(targetKey) => edit({ targetKey })}
              />
            )}
            {choice && (
              <ChoiceField
                id="fleet-request-choice"
                label={t.field[choice.field]}
                error={message('choice')}
                value={draft.choice}
                options={choice.options.map((value) => ({
                  value,
                  label: choiceLabels[value] ?? value,
                }))}
                onChange={(next) => edit({ choice: next })}
              />
            )}
            {spec.commitSha && (
              <TextField
                id="fleet-request-sha"
                label={t.field.commitSha}
                error={message('commitSha')}
                value={draft.commitSha}
                mono
                onChange={(commitSha) => edit({ commitSha })}
              />
            )}
            <div className="sm:col-span-2">
              <TextField
                id="fleet-request-quote"
                label={
                  spec.quoteRequired ? t.field.quoteRequired : t.field.quote
                }
                error={message('quote')}
                value={draft.quote}
                multiline
                onChange={(quote) => edit({ quote })}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3 border-t px-4 py-3 md:px-5">
            <SubmitStatus state={state} />
            <Button type="submit" disabled={state.kind === 'submitting'}>
              {state.kind === 'submitting'
                ? t.requests.submitting
                : t.requests.submit}
            </Button>
          </div>
        </form>
      </Panel>
    </section>
  );
}

function submitState(mutation: ReturnType<typeof useSubmitFleetIntent>) {
  if (mutation.isPending) return { kind: 'submitting' } as SubmitState;
  if (mutation.isError) {
    return { kind: 'refused', reason: 'unavailable' } as SubmitState;
  }
  const result = mutation.data;
  if (!result) return { kind: 'editing' } as SubmitState;
  return (
    result.kind === 'ok'
      ? { kind: 'filed' }
      : { kind: 'refused', reason: result.reason }
  ) as SubmitState;
}

function SubmitStatus({ state }: { state: SubmitState }) {
  const { t } = useFleetText();
  switch (state.kind) {
    case 'editing':
    case 'submitting':
      return null;
    case 'filed':
      return (
        <output className="mr-auto text-muted-foreground text-sm">
          {t.requests.submitted}
        </output>
      );
    case 'refused':
      return (
        <p role="alert" className="mr-auto text-destructive text-sm">
          {t.refusal[state.reason]}
        </p>
      );
  }
}
