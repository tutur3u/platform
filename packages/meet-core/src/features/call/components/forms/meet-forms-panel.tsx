'use client';

import { Send } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { type MeetFormsCopy, useMeetFormsCopy } from './meet-forms-copy';
import {
  FormImage,
  FormText,
  MeetFormsQuestionField,
} from './meet-forms-question';
import {
  isGatedQuestion,
  mergeMeetFormsPrefill,
  plainFormText,
  planMeetFormsPath,
  questionIssue,
} from './respondent-flow';
import type {
  MeetFormsBinding,
  MeetFormsDefinition,
  MeetFormsGates,
  MeetFormsPanelProps,
  MeetFormsResult,
} from './types';

export type { MeetFormsPanelProps } from './types';

export function MeetFormsPanel(props: MeetFormsPanelProps) {
  const copy = useMeetFormsCopy();
  const { state } = props;

  switch (state.kind) {
    case 'loading':
      return (
        <div
          role="status"
          className="space-y-3 rounded-lg border border-border p-3"
        >
          <span className="sr-only">{copy.loading}</span>
          <Skeleton className="h-5 w-3/5" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      );
    case 'empty':
      return (
        <p role="status" className="text-muted-foreground text-sm">
          {copy.empty}
        </p>
      );
    case 'error':
      return (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p role="alert">{copy.loadError}</p>
          {state.onRetry && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={state.onRetry}
            >
              {copy.retry}
            </Button>
          )}
        </div>
      );
    case 'open':
    case 'closed':
      return (
        <ActiveMeetForm
          key={JSON.stringify([
            state.form.launchId,
            state.form.id,
            state.form.versionId,
          ])}
          {...props}
          definition={state.form}
          closed={state.kind === 'closed'}
          copy={copy}
        />
      );
  }
}

type Operation =
  | {
      kind:
        | 'idle'
        | 'submitting'
        | 'submitted'
        | 'prefilling'
        | 'prefillError'
        | 'submitError';
    }
  | { kind: 'uploading' | 'uploadError'; questionId: string };

function ActiveMeetForm({
  definition,
  answers,
  onAnswersChange,
  prefillAnswers,
  onPrefill,
  prefilledQuestionIds,
  onPrefilledQuestionIdsChange,
  onSubmit,
  onUpload,
  result,
  submissionDisabled,
  submitBlocked,
  submissionControls,
  gates: requestedGates,
  closed,
  copy,
}: MeetFormsPanelProps & {
  definition: MeetFormsDefinition;
  closed: boolean;
  copy: MeetFormsCopy;
}) {
  const binding: MeetFormsBinding = {
    launchId: definition.launchId,
    formId: definition.id,
    versionId: definition.versionId,
  };
  const receipt =
    result &&
    result.launchId === binding.launchId &&
    result.formId === binding.formId &&
    result.versionId === binding.versionId
      ? result
      : null;
  const [sectionId, setSectionId] = useState<string>();
  const [showIssues, setShowIssues] = useState(false);
  const [operation, setOperation] = useState<Operation>({ kind: 'idle' });
  const [prefillApplied, setPrefillApplied] = useState(false);
  const [localPrefillIds, setLocalPrefillIds] = useState<readonly string[]>([]);
  const [confirmedDetails, setConfirmedDetails] = useState<string>();
  const request = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const sectionForm = useRef<HTMLFormElement>(null);
  const focusHeading = useRef(false);
  const titleId = useId();
  const confirmId = useId();

  const gates: MeetFormsGates = {
    ...requestedGates,
    uploads: Boolean(requestedGates?.uploads && onUpload),
  };
  const plan = planMeetFormsPath(definition, answers, gates);
  const prefillIds = prefilledQuestionIds ?? localPrefillIds;
  const details = plan.path.flatMap((step) =>
    step.questions.flatMap((question) => {
      const value = plan.answers[question.id];
      if (!prefillIds.includes(question.id) || typeof value !== 'string') {
        return [];
      }
      return [{ id: question.id, label: plainFormText(question.title), value }];
    })
  );
  const detailsKey = JSON.stringify(details);
  const needsConfirmation =
    details.length > 0 && confirmedDetails !== detailsKey;
  const plannedIndex = plan.path.findIndex(
    (section) => section.id === sectionId
  );
  const index = Math.max(0, plannedIndex);
  const section = plan.path[index];
  const next = plan.path[index + 1];
  const busy =
    operation.kind === 'submitting' ||
    operation.kind === 'prefilling' ||
    operation.kind === 'uploading';
  const submitted = Boolean(receipt) || operation.kind === 'submitted';
  const hasGatedRequirement = plan.path.some((step) =>
    step.questions.some(
      (question) => question.required && isGatedQuestion(question, gates)
    )
  );
  const unavailable = Boolean(submissionDisabled);
  const readOnly = closed || unavailable || submitted;
  const cannotSubmit = plan.invalid || submitBlocked || hasGatedRequirement;

  function issueFor(
    question: MeetFormsDefinition['sections'][number]['questions'][number]
  ) {
    return isGatedQuestion(question, gates)
      ? undefined
      : questionIssue(question, plan.answers[question.id]);
  }

  useEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
    },
    []
  );

  useEffect(() => {
    if (readOnly && request.current) {
      request.current.abort();
      request.current = null;
      setOperation({ kind: 'idle' });
    }
  }, [readOnly]);

  useEffect(() => {
    if (!focusHeading.current) return;
    focusHeading.current = false;
    heading.current?.focus();
  }, [section?.id]);

  useEffect(() => {
    if (!showIssues) return;
    sectionForm.current
      ?.querySelector<HTMLElement>(
        '[data-question-invalid] :is(input, textarea, button):not(:disabled)'
      )
      ?.focus();
  }, [showIssues, section?.id]);

  function visit(target: string) {
    focusHeading.current = true;
    setSectionId(target);
    setShowIssues(false);
    if (operation.kind === 'submitError') setOperation({ kind: 'idle' });
  }

  function startRequest(nextOperation: Operation) {
    if (readOnly || request.current) return null;
    const controller = new AbortController();
    request.current = controller;
    setOperation(nextOperation);
    return controller;
  }

  function finishRequest(
    controller: AbortController,
    nextOperation: Operation
  ) {
    if (request.current !== controller || controller.signal.aborted)
      return false;
    request.current = null;
    setOperation(nextOperation);
    return true;
  }

  async function prefill() {
    const controller = startRequest({ kind: 'prefilling' });
    if (!controller) return;
    try {
      const suggestions = onPrefill
        ? await onPrefill(binding)
        : (prefillAnswers ?? {});
      if (finishRequest(controller, { kind: 'idle' })) {
        const nextAnswers = mergeMeetFormsPrefill(
          definition,
          answers,
          suggestions
        );
        if (nextAnswers !== answers) {
          const added = Object.keys(nextAnswers).filter(
            (id) => !Object.hasOwn(answers, id)
          );
          const nextIds = [...new Set([...prefillIds, ...added])];
          setLocalPrefillIds(nextIds);
          onPrefilledQuestionIdsChange?.(nextIds);
          onAnswersChange(nextAnswers);
        }
        setPrefillApplied(true);
      }
    } catch {
      finishRequest(controller, { kind: 'prefillError' });
    }
  }

  async function upload(questionId: string, files: File[]) {
    if (!onUpload) return;
    const controller = startRequest({ kind: 'uploading', questionId });
    if (!controller) return;
    try {
      const references: string[] = [];
      for (const file of files) {
        controller.signal.throwIfAborted();
        const reference = await onUpload({
          ...binding,
          questionId,
          file,
          signal: controller.signal,
        });
        if (!reference.trim())
          throw new Error('Upload returned an empty reference');
        references.push(reference);
      }
      if (finishRequest(controller, { kind: 'idle' })) {
        onAnswersChange({ ...answers, [questionId]: references });
      }
    } catch {
      finishRequest(controller, { kind: 'uploadError', questionId });
    }
  }

  async function advance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!section || readOnly || request.current) return;
    setShowIssues(true);
    if (section.questions.some(issueFor)) return;
    if (next) {
      visit(next.id);
      return;
    }
    if (cannotSubmit || needsConfirmation) return;

    const missingSection = plan.path.find((step) =>
      step.questions.some(issueFor)
    );
    if (missingSection) {
      visit(missingSection.id);
      setShowIssues(true);
      return;
    }

    const controller = startRequest({ kind: 'submitting' });
    if (!controller) return;
    try {
      await onSubmit({ ...binding, answers: plan.answers });
      finishRequest(controller, { kind: 'submitted' });
    } catch {
      finishRequest(controller, { kind: 'submitError' });
    }
  }

  return (
    <article
      aria-labelledby={titleId}
      className="min-w-0 space-y-3 rounded-lg border border-border p-3 text-sm"
    >
      <header className="space-y-2">
        <h2 id={titleId} className="wrap-anywhere font-semibold text-base">
          {definition.title}
        </h2>
        {definition.description && (
          <div className="text-muted-foreground">
            <FormText text={definition.description} />
          </div>
        )}
      </header>
      {submitted ? (
        <SubmissionReceipt
          copy={copy}
          definition={definition}
          result={gates.grading ? receipt : null}
        />
      ) : closed ? (
        <p role="status" className="text-muted-foreground">
          {copy.closed}
        </p>
      ) : (
        <>
          {(unavailable || hasGatedRequirement) && (
            <p role="status" className="text-muted-foreground">
              {copy.unavailable}
            </p>
          )}
          {!section && (
            <p role="status" className="text-muted-foreground">
              {copy.empty}
            </p>
          )}
          {!unavailable && !prefillApplied && (onPrefill || prefillAnswers) && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void prefill()}
            >
              {copy.prefill}
            </Button>
          )}
          {operation.kind === 'prefillError' && (
            <p role="alert" className="text-destructive">
              {copy.prefillError}
            </p>
          )}
          {section && (
            <form
              ref={sectionForm}
              aria-busy={busy}
              className="space-y-3"
              onSubmit={(event) => void advance(event)}
            >
              <h3
                ref={heading}
                tabIndex={-1}
                className={section.title ? 'font-medium' : 'sr-only'}
              >
                {section.title
                  ? plainFormText(section.title)
                  : copy.section(index + 1)}
              </h3>
              {section.description && <FormText text={section.description} />}
              <FormImage image={section.image} />
              {section.questions.map((question) => {
                const value = Object.hasOwn(answers, question.id)
                  ? answers[question.id]
                  : undefined;
                const gated = isGatedQuestion(question, gates);
                const issue =
                  showIssues && !gated
                    ? questionIssue(question, value)
                    : undefined;
                return (
                  <MeetFormsQuestionField
                    key={question.id}
                    question={question}
                    value={value}
                    gated={gated}
                    copy={copy}
                    disabled={busy || readOnly}
                    error={issue ? copy[issue] : undefined}
                    onChange={(nextValue) =>
                      onAnswersChange({ ...answers, [question.id]: nextValue })
                    }
                    upload={
                      gated || question.type !== 'file_upload'
                        ? { kind: 'unavailable' }
                        : operation.kind === 'uploading' &&
                            operation.questionId === question.id
                          ? { kind: 'pending' }
                          : {
                              kind: 'available',
                              error:
                                operation.kind === 'uploadError' &&
                                operation.questionId === question.id,
                              onSelect: (files) =>
                                void upload(question.id, files),
                            }
                    }
                  />
                );
              })}
              {plan.invalid && !next && (
                <p role="alert" className="text-destructive">
                  {copy.invalidBranch}
                </p>
              )}
              {operation.kind === 'submitError' && (
                <p role="alert" className="text-destructive">
                  {copy.submitError}
                </p>
              )}
              {!readOnly && (
                <>
                  {!next && submissionControls}
                  {!next && details.length > 0 && (
                    <fieldset className="space-y-2 rounded-md border border-border p-3 text-sm">
                      <legend className="px-1 font-medium">
                        {copy.reviewDetails}
                      </legend>
                      <dl className="space-y-2">
                        {details.map(({ id, label, value }) => (
                          <div key={id} className="wrap-anywhere">
                            <dt className="text-muted-foreground">{label}</dt>
                            <dd className="whitespace-pre-wrap">{value}</dd>
                          </div>
                        ))}
                      </dl>
                      <label
                        htmlFor={confirmId}
                        className="flex items-start gap-2"
                      >
                        <Checkbox
                          id={confirmId}
                          className="mt-0.5"
                          checked={confirmedDetails === detailsKey}
                          disabled={busy}
                          onCheckedChange={(checked) =>
                            setConfirmedDetails(
                              checked === true ? detailsKey : undefined
                            )
                          }
                        />
                        {copy.confirmDetails}
                      </label>
                    </fieldset>
                  )}
                  <div className="flex gap-2">
                    {index > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          const previous = plan.path[index - 1];
                          if (previous) visit(previous.id);
                        }}
                      >
                        {copy.back}
                      </Button>
                    )}
                    <Button
                      type="submit"
                      className="min-w-0 flex-1"
                      disabled={
                        busy || (!next && (cannotSubmit || needsConfirmation))
                      }
                    >
                      {!next && <Send aria-hidden="true" />}
                      {next
                        ? copy.next
                        : operation.kind === 'submitting'
                          ? copy.submitting
                          : copy.submit}
                    </Button>
                  </div>
                </>
              )}
            </form>
          )}
        </>
      )}
    </article>
  );
}

function SubmissionReceipt({
  copy,
  definition,
  result,
}: {
  copy: MeetFormsCopy;
  definition: MeetFormsDefinition;
  result: MeetFormsResult | null;
}) {
  const grade = result?.kind === 'graded' ? result : null;
  const questions = new Map(
    definition.sections.flatMap((section) =>
      section.questions.map(
        (question) => [question.id, question.title] as const
      )
    )
  );

  return (
    <div className="space-y-2 rounded-md bg-muted/40 p-2">
      <div role="status" className="space-y-1">
        <p>{copy.submitted}</p>
        {grade?.score && (
          <p className="font-medium">
            {copy.score(grade.score.earned, grade.score.possible)}
          </p>
        )}
      </div>
      {grade?.reveal?.length ? (
        <ul className="space-y-2">
          {grade.reveal.map((entry) => {
            const title = questions.get(entry.questionId);
            return title ? (
              <li
                key={entry.questionId}
                className="wrap-anywhere border-border border-t pt-2"
              >
                <div className="font-medium">
                  <FormText text={title} />
                </div>
                <p>
                  {copy.correctAnswer}{' '}
                  <span className="font-medium">{entry.answer}</span>
                </p>
                {entry.explanation && (
                  <p className="text-muted-foreground">{entry.explanation}</p>
                )}
              </li>
            ) : null;
          })}
        </ul>
      ) : null}
    </div>
  );
}
