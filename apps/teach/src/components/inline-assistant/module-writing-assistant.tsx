'use client';

import { useMutation } from '@tanstack/react-query';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Editor } from '@tiptap/react';
import {
  validateInlineSuggestions,
  type AssistanceLevel,
  type AssistanceSubject,
  type InlineSuggestion,
} from '@tuturuuu/education-core/education/inline-assistant';
import { reviewEducationDocument } from '@tuturuuu/internal-api/education';
import { Button } from '@tuturuuu/ui/button';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { readEditorSnapshot, suggestionRange } from './editor-snapshot';

type ReviewState =
  | { kind: 'idle' | 'off' | 'stale' | 'loading' | 'streaming' | 'error' }
  | { kind: 'ready'; revision: string; suggestions: InlineSuggestion[] };

export function ModuleWritingAssistant({
  editor,
  wsId,
  courseId,
  moduleId,
}: {
  editor: Editor | null;
  wsId: string;
  courseId: string;
  moduleId: string;
}) {
  const t = useTranslations('inlineAssistant');
  const locale = useLocale() === 'vi' ? 'vi' : 'en';
  const id = useId();
  const [level, setLevel] = useState<AssistanceLevel>('off');
  const [subject, setSubject] = useState<AssistanceSubject>('writing');
  const [state, setState] = useState<ReviewState>({ kind: 'off' });
  const [selected, setSelected] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const active = useRef<{
    level: AssistanceLevel;
    subject: AssistanceSubject;
    locale: 'en' | 'vi';
  }>({ level, subject, locale });
  active.current = { level, subject, locale };
  const request = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const autoReview = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cache = useRef(new Map<string, InlineSuggestion[]>());
  const pluginKey = useRef(
    new PluginKey<DecorationSet>('educationInlineAssistance')
  );

  const clearMarks = () => {
    if (editor && !editor.isDestroyed)
      editor.view.dispatch(editor.state.tr.setMeta(pluginKey.current, []));
  };
  const cancel = () => {
    sequence.current++;
    request.current?.abort();
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    clearMarks();
  };

  const review = useMutation({
    mutationFn: async () => {
      if (!editor || editor.isDestroyed || active.current.level === 'off')
        return;
      cancel();
      const version = sequence.current;
      const policy = { ...active.current };
      const snapshot = readEditorSnapshot(editor.state.doc);
      if (!snapshot.text.trim()) {
        setState({ kind: 'idle' });
        return;
      }
      if (snapshot.text.length > 12_000) {
        setState({ kind: 'error' });
        return;
      }
      const key = JSON.stringify([policy, snapshot.text]);
      const controller = new AbortController();
      request.current = controller;
      setState({ kind: 'loading' });
      try {
        let suggestions = cache.current.get(key);
        if (!suggestions) {
          const output = await reviewEducationDocument(
            {
              wsId,
              courseId,
              moduleId,
              text: snapshot.text,
              subject: policy.subject,
              locale: policy.locale,
              level: policy.level as 'hints' | 'full',
            },
            controller.signal,
            () => {
              if (version === sequence.current)
                setState((current) =>
                  current.kind === 'streaming' ? current : { kind: 'streaming' }
                );
            }
          );
          suggestions = validateInlineSuggestions(output, snapshot.text, {
            workspaceEnabled: true,
            teacherLevel: policy.level,
            subject: policy.subject,
            locale: policy.locale,
          });
        }
        if (
          controller.signal.aborted ||
          version !== sequence.current ||
          editor.isDestroyed ||
          readEditorSnapshot(editor.state.doc).revision !== snapshot.revision
        )
          return;
        if (cache.current.size >= 8)
          cache.current.delete(cache.current.keys().next().value!);
        cache.current.set(key, suggestions);
        setState({ kind: 'ready', revision: snapshot.revision, suggestions });
        setSelected(suggestions[0]?.id ?? null);
      } catch {
        if (!controller.signal.aborted && version === sequence.current)
          setState({ kind: 'error' });
      }
    },
  });
  const reviewRef = useRef(review.mutate);
  reviewRef.current = review.mutate;

  useEffect(() => {
    if (!editor) return;
    const key = pluginKey.current;
    editor.registerPlugin(
      new Plugin<DecorationSet>({
        key,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, previous) {
            const suggestions = tr.getMeta(key) as
              | InlineSuggestion[]
              | undefined;
            if (suggestions)
              return DecorationSet.create(
                tr.doc,
                suggestions.flatMap((item) => {
                  const range = suggestionRange(tr.doc, item);
                  return range
                    ? [
                        Decoration.inline(range.from, range.to, {
                          class:
                            'underline decoration-dotted decoration-2 decoration-primary underline-offset-4',
                          'data-suggestion-id': item.id,
                        }),
                      ]
                    : [];
                })
              );
            return tr.docChanged ? DecorationSet.empty : previous;
          },
        },
        props: {
          decorations: (state) => key.getState(state),
          handleKeyDown(_view, event) {
            if (
              event.altKey &&
              event.shiftKey &&
              event.key.toLowerCase() === 'a'
            ) {
              event.preventDefault();
              panelRef.current?.focus();
              return true;
            }
            return false;
          },
          handleClick(view, pos) {
            const decoration = key.getState(view.state)?.find(pos, pos)[0];
            const element =
              decoration && view.dom.querySelector(`[data-suggestion-id]`);
            // Finding the position through the validated ranges avoids selectors
            // containing untrusted model-supplied identifiers.
            if (!element) return false;
            const at = view.domAtPos(pos).node;
            const parent = at instanceof Element ? at : at.parentElement;
            const suggestionId = parent
              ?.closest('[data-suggestion-id]')
              ?.getAttribute('data-suggestion-id');
            if (!suggestionId) return false;
            setSelected(suggestionId);
            panelRef.current?.focus();
            return true;
          },
        },
      })
    );
    const onUpdate = ({ transaction }: { transaction: Transaction }) => {
      if (!transaction.docChanged) return;
      sequence.current++;
      request.current?.abort();
      if (timer.current) clearTimeout(timer.current);
      if (active.current.level === 'off') return;
      setState({ kind: 'stale' });
      if (autoReview.current)
        timer.current = setTimeout(() => reviewRef.current(), 900);
    };
    editor.on('transaction', onUpdate);
    return () => {
      sequence.current++;
      request.current?.abort();
      if (timer.current) clearTimeout(timer.current);
      editor.off('transaction', onUpdate);
      if (!editor.isDestroyed) editor.unregisterPlugin(key);
      cache.current.clear();
    };
  }, [editor]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.view.dispatch(
      editor.state.tr.setMeta(
        pluginKey.current,
        state.kind === 'ready' ? state.suggestions : []
      )
    );
  }, [editor, state]);

  const reset = (
    nextLevel: AssistanceLevel,
    nextSubject: AssistanceSubject
  ) => {
    cancel();
    autoReview.current = false;
    cache.current.clear();
    active.current = { level: nextLevel, subject: nextSubject, locale };
    setLevel(nextLevel);
    setSubject(nextSubject);
    setState({ kind: nextLevel === 'off' ? 'off' : 'idle' });
  };
  const dismiss = (item: InlineSuggestion) => {
    if (state.kind !== 'ready') return;
    const remaining = state.suggestions.filter(
      (suggestion) => suggestion.id !== item.id
    );
    setState({ ...state, suggestions: remaining });
    setSelected(remaining[0]?.id ?? null);
    panelRef.current?.focus();
  };
  const accept = (item: InlineSuggestion) => {
    if (
      !editor ||
      state.kind !== 'ready' ||
      active.current.level !== 'full' ||
      item.replacement === undefined
    )
      return;
    if (readEditorSnapshot(editor.state.doc).revision !== state.revision) {
      cancel();
      setState({ kind: 'stale' });
      return;
    }
    const range = suggestionRange(editor.state.doc, item);
    if (!range) {
      cancel();
      setState({ kind: 'stale' });
      return;
    }
    // insertText treats model output literally, preserving inline marks and undo.
    editor.view.dispatch(
      editor.state.tr.insertText(item.replacement, range.from, range.to)
    );
    editor.commands.focus();
  };
  const busy = state.kind === 'loading' || state.kind === 'streaming';
  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      aria-label={t('title')}
      aria-keyshortcuts="Alt+Shift+A"
      className="min-w-0 space-y-4 rounded-lg border border-border bg-card p-4 text-card-foreground focus-visible:outline focus-visible:outline-ring"
    >
      <div className="space-y-1">
        <h2 className="font-semibold text-base">{t('title')}</h2>
        <p className="text-muted-foreground text-xs">{t('scope')}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        <div className="space-y-1">
          <label htmlFor={`${id}-level`} className="font-medium text-sm">
            {t('level')}
          </label>
          <select
            id={`${id}-level`}
            value={level}
            onChange={(event) =>
              reset(event.target.value as AssistanceLevel, subject)
            }
            className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline focus-visible:outline-ring"
          >
            {(['off', 'hints', 'full'] as const).map((value) => (
              <option key={value} value={value}>
                {t(value)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-subject`} className="font-medium text-sm">
            {t('subject')}
          </label>
          <select
            id={`${id}-subject`}
            value={subject}
            onChange={(event) =>
              reset(level, event.target.value as AssistanceSubject)
            }
            className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline focus-visible:outline-ring"
          >
            {(
              [
                'writing',
                'math',
                'physics',
                'chemistry',
                'biology',
                'general',
              ] as const
            ).map((value) => (
              <option key={value} value={value}>
                {t(value)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        disabled={!editor || level === 'off' || busy}
        onClick={() => {
          autoReview.current = true;
          review.mutate();
        }}
      >
        {t(busy ? 'reviewing' : state.kind === 'error' ? 'retry' : 'review')}
      </Button>
      <p
        role={state.kind === 'error' ? 'alert' : 'status'}
        aria-live="polite"
        className="text-muted-foreground text-sm"
      >
        {t(
          state.kind === 'ready'
            ? state.suggestions.length
              ? 'found'
              : 'empty'
            : state.kind
        )}
      </p>
      {state.kind === 'ready' ? (
        <ul className="space-y-3">
          {state.suggestions.map((item) => (
            <li
              key={item.id}
              className="space-y-2 border-border border-t pt-3"
              data-selected={selected === item.id || undefined}
            >
              <button
                type="button"
                className="w-full break-words text-left font-medium text-sm underline decoration-dotted underline-offset-4 focus-visible:outline focus-visible:outline-ring"
                onClick={() => {
                  setSelected(item.id);
                  const range =
                    editor && suggestionRange(editor.state.doc, item);
                  if (range)
                    editor
                      ?.chain()
                      .focus()
                      .setTextSelection(range)
                      .scrollIntoView()
                      .run();
                }}
              >
                {item.original}
              </button>
              <p className="whitespace-pre-wrap break-words text-sm">
                {item.explanation}
              </p>
              {level === 'full' && item.replacement !== undefined ? (
                <p className="whitespace-pre-wrap break-words text-muted-foreground text-sm">
                  {item.replacement || t('remove')}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {level === 'full' && item.replacement !== undefined ? (
                  <Button type="button" size="sm" onClick={() => accept(item)}>
                    {t('accept')}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => dismiss(item)}
                >
                  {t('dismiss')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </aside>
  );
}
