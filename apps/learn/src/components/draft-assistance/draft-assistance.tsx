'use client';

import { Button } from '@tuturuuu/ui/button';
import { useLocale, useTranslations } from 'next-intl';
import { type RefObject, useEffect, useId, useRef, useState } from 'react';
import {
  acceptSuggestion,
  type Eligibility,
  MAX_REVIEW_LENGTH,
  type Review,
  type ReviewProvider,
  SUBJECTS,
  type Subject,
  selectReviewText,
} from './review';
import { ReviewResults } from './review-results';

type State =
  | { kind: 'idle' }
  | { kind: 'running'; source: string }
  | { kind: 'ready'; review: Review }
  | { kind: 'error' };

export function DraftAssistance({
  value,
  onChange,
  editorRef,
  disabled = false,
  eligibility = 'unknown',
  provider,
}: {
  value: string;
  onChange: (text: string) => void;
  editorRef: RefObject<HTMLTextAreaElement | null>;
  disabled?: boolean;
  eligibility?: Eligibility;
  provider?: ReviewProvider;
}) {
  const t = useTranslations('draftAssistance');
  const locale = useLocale();
  const id = useId();
  const [subject, setSubject] = useState<Subject>('writing');
  const [state, setState] = useState<State>({ kind: 'idle' });
  const active = useRef<AbortController | null>(null);
  const available = eligibility === 'eligible' && !!provider && !disabled;

  useEffect(() => {
    setState({ kind: 'idle' });
  }, [disabled, eligibility, provider, locale]);

  useEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
    },
    [value, disabled, eligibility, provider, subject, locale]
  );

  const stale =
    (state.kind === 'ready' && state.review.source !== value) ||
    (state.kind === 'running' && state.source !== value);
  const running = state.kind === 'running' && !stale && available;

  async function review() {
    if (!available || !provider || active.current) return;
    const element = editorRef.current;
    const selection =
      element && element.selectionEnd > element.selectionStart
        ? { start: element.selectionStart, end: element.selectionEnd }
        : { start: 0, end: value.length };
    let text: string;
    try {
      text = selectReviewText(value, selection);
    } catch {
      setState({ kind: 'error' });
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setState({ kind: 'running', source: value });
    try {
      const suggestions = await provider(
        { text, subject, locale },
        controller.signal,
        () => {}
      );
      if (active.current !== controller || controller.signal.aborted) return;
      setState({
        kind: 'ready',
        review: { source: value, selection, suggestions },
      });
    } catch {
      if (active.current === controller && !controller.signal.aborted) {
        setState({ kind: 'error' });
      }
    } finally {
      if (active.current === controller) active.current = null;
    }
  }

  function accept(index: number) {
    if (!available || state.kind !== 'ready') return;
    const result = acceptSuggestion(value, state.review, index);
    if (!result) return;
    onChange(result.text);
    setState({ kind: 'idle' });
    requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor || editor.value !== result.text) return;
      editor.focus();
      editor.setSelectionRange(result.selection.start, result.selection.end);
    });
  }

  return (
    <details className="border-border border-t p-3">
      <summary className="cursor-pointer rounded-sm font-medium text-sm focus-visible:outline focus-visible:outline-ring">
        {t('title')}
      </summary>
      <div className="mt-3 space-y-3" aria-busy={running}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor={id} className="block text-sm">
              {t('subject')}
            </label>
            <select
              id={id}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={subject}
              onChange={(event) => {
                setSubject(event.target.value as Subject);
                setState({ kind: 'idle' });
              }}
            >
              {SUBJECTS.map((item) => (
                <option key={item} value={item}>
                  {t(`subjects.${item}`)}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={!available || running || !value.trim()}
            onClick={() => void review()}
            aria-describedby={`${id}-policy ${id}-scope`}
          >
            {state.kind === 'error' ? t('retry') : t('review')}
          </Button>
          {running && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                active.current?.abort();
                active.current = null;
                setState({ kind: 'idle' });
              }}
            >
              {t('cancel')}
            </Button>
          )}
        </div>
        <p id={`${id}-scope`} className="text-muted-foreground text-xs">
          {t('scope', { limit: MAX_REVIEW_LENGTH })}
        </p>
        <p id={`${id}-policy`} className="text-muted-foreground text-xs">
          {t(available ? 'credits' : 'unavailable')}
        </p>
        {stale ? (
          <p role="status" className="text-sm">
            {t('stale')}
          </p>
        ) : state.kind === 'error' ? (
          <p role="alert" className="text-destructive text-sm">
            {t('error')}
          </p>
        ) : running ? (
          <div className="space-y-2">
            <p role="status" className="text-sm">
              {t('reviewing')}
            </p>
          </div>
        ) : state.kind === 'ready' ? (
          <ReviewResults
            suggestions={state.review.suggestions}
            disabled={!available}
            onAccept={accept}
            onReject={(index) =>
              setState({
                kind: 'ready',
                review: {
                  ...state.review,
                  suggestions: state.review.suggestions.filter(
                    (_, item) => item !== index
                  ),
                },
              })
            }
          />
        ) : null}
      </div>
    </details>
  );
}
