'use client';

import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useEffect,
  useRef,
} from 'react';
import { MIRA_DRAFT_PROMPT_PARAM } from '../mira-draft-prompt';

/** Current URL without `?prompt=`; other params and hash unchanged. */
export function withoutMiraDraftPrompt(href: string) {
  const url = new URL(href);
  url.searchParams.delete(MIRA_DRAFT_PROMPT_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Applies a validated `?prompt=` draft once per page load:
 * - removes the parameter from the current history entry first, so a reload,
 *   Back or a remounted panel never applies it again (malformed values the
 *   server rejected are removed too);
 * - fills an empty composer, or adds the text after the user's own draft and
 *   says so, never replacing what they typed;
 * - focuses the composer. It never sends and never spends credits.
 */
export function useMiraDraftPrefill({
  draft,
  input,
  setInput,
  inputRef,
  onConsumed,
}: {
  draft?: string;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onConsumed?: () => void;
}) {
  const t = useTranslations('dashboard.mira_chat');
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    if (new URL(window.location.href).searchParams.has(MIRA_DRAFT_PROMPT_PARAM)) {
      window.history.replaceState(
        window.history.state,
        '',
        withoutMiraDraftPrompt(window.location.href)
      );
    }
    if (!draft) return;

    const existing = input.trim();
    if (!existing) {
      setInput(draft);
    } else if (!existing.includes(draft)) {
      setInput(`${input.trimEnd()}\n\n${draft}`);
      toast.info(t('prompt_added_to_draft'));
    }
    onConsumed?.();
    window.requestAnimationFrame(() =>
      inputRef.current?.focus({ preventScroll: true })
    );
  }, [draft, input, setInput, inputRef, onConsumed, t]);
}
