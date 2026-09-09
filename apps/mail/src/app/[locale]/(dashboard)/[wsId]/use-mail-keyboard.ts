'use client';

import type { MailThreadSummary } from '@tuturuuu/internal-api';
import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { MailFolder } from './mail-folders';
import {
  MAIL_FOLDER_SHORTCUTS,
  mailKeyboardCommand,
  mailKeyboardTargetBlocked,
} from './mail-keyboard-commands';
import { subscribeMailKeyboard } from './mail-keyboard-events';
import { useMailKeyboardPreference } from './mail-keyboard-preference';

type Action =
  | 'archive'
  | 'trash'
  | 'star'
  | 'unstar'
  | 'mark_read'
  | 'mark_unread';
export interface MailKeyboardOptions {
  threads: MailThreadSummary[];
  threadId: string | null;
  folder: MailFolder;
  composerOpen: boolean;
  selectionScope: string;
  selected: Set<string>;
  setSelected: Dispatch<SetStateAction<Set<string>>>;
  openThread: (id: string | null) => void;
  compose: () => void;
  reply: (mode: 'reply' | 'reply_all' | 'forward') => void;
  action: (action: Action, id: string) => void;
  bulkAction: (action: 'archive' | 'trash' | 'mark_read') => void;
  deleteDraft: () => void;
  navigate: (folder: MailFolder) => void;
  refresh: () => void;
}

export function useMailKeyboard(options: MailKeyboardOptions) {
  const [enabled] = useMailKeyboardPreference();
  const [helpOpen, setHelpOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const pendingGo = useRef(0);
  const previousScope = useRef(options.selectionScope);
  const focusThread = (id: string | null) => {
    const rows = rootRef.current?.querySelectorAll<HTMLButtonElement>(
      '[data-mail-thread-open]'
    );
    const row = Array.from(rows ?? []).find(
      (element) =>
        element.dataset.mailThreadOpen === id &&
        element.getClientRects().length > 0
    );
    row?.focus();
    row?.scrollIntoView?.({ block: 'nearest' });
  };

  useEffect(() => {
    if (
      previousScope.current !== options.selectionScope ||
      !enabled ||
      options.composerOpen
    ) {
      pendingGo.current = 0;
      previousScope.current = options.selectionScope;
    }
  }, [options.selectionScope, enabled, options.composerOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.repeat ||
        options.composerOpen ||
        helpOpen ||
        mailKeyboardTargetBlocked(event.target) ||
        document.querySelector(
          '[role="dialog"][data-state="open"], [role="alertdialog"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"]'
        )
      ) {
        pendingGo.current = 0;
        return;
      }
      const row =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-mail-thread-id]')
          : null;
      const targetId = row?.dataset.mailThreadId ?? options.threadId;
      const current = options.threads.find((thread) => thread.id === targetId);
      const command = mailKeyboardCommand(event);
      if (
        pendingGo.current &&
        enabled &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey
      ) {
        const folder = MAIL_FOLDER_SHORTCUTS[event.key];
        const valid = performance.now() - pendingGo.current < 1200;
        pendingGo.current = 0;
        if (valid && folder) {
          event.preventDefault();
          options.navigate(folder);
          return;
        }
      }
      if (!command) return;
      const nativeNavigation = ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(
        event.key
      );
      // Arrow/Home/End keys belong to the focused list; preserve scrolling and other widgets.
      if (nativeNavigation && !row) return;
      if (!enabled && !nativeNavigation && event.key !== 'Escape') return;
      if (command === 'help') {
        event.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (command === 'go') {
        event.preventDefault();
        pendingGo.current = performance.now();
        return;
      }
      if (command === 'search') {
        const search = Array.from(
          rootRef.current?.querySelectorAll<HTMLInputElement>(
            '[data-mail-search]'
          ) ?? []
        ).find((input) => input.getClientRects().length > 0);
        if (!search) {
          options.openThread(null);
          requestAnimationFrame(() =>
            rootRef.current
              ?.querySelector<HTMLInputElement>('[data-mail-search]')
              ?.focus()
          );
        } else {
          search.focus();
          search.select();
        }
        event.preventDefault();
        return;
      }
      if (command === 'compose') {
        event.preventDefault();
        options.compose();
        return;
      }
      if (command === 'refresh') {
        event.preventDefault();
        options.refresh();
        return;
      }
      if (command === 'back') {
        if (!options.selected.size && !options.threadId) return;
        event.preventDefault();
        if (options.selected.size) options.setSelected(new Set());
        else {
          options.openThread(null);
          requestAnimationFrame(() => focusThread(targetId));
        }
        return;
      }
      if (['next', 'previous', 'first', 'last'].includes(command)) {
        if (!options.threads.length) return;
        const index = options.threads.findIndex(
          (thread) => thread.id === targetId
        );
        const nextIndex =
          command === 'first'
            ? 0
            : command === 'last'
              ? options.threads.length - 1
              : index < 0
                ? 0
                : Math.max(
                    0,
                    Math.min(
                      options.threads.length - 1,
                      index + (command === 'next' ? 1 : -1)
                    )
                  );
        const next = options.threads[nextIndex];
        if (!next) return;
        event.preventDefault();
        if (!nativeNavigation && options.threadId) options.openThread(next.id);
        focusThread(next.id);
        return;
      }
      if (command === 'select_all') {
        event.preventDefault();
        options.setSelected(
          new Set(
            options.threads.every((thread) => options.selected.has(thread.id))
              ? []
              : options.threads.map((thread) => thread.id)
          )
        );
        return;
      }
      if (
        options.selected.size &&
        ['archive', 'trash', 'read'].includes(command)
      ) {
        if (options.folder === 'drafts') return;
        event.preventDefault();
        options.bulkAction(
          command === 'read' ? 'mark_read' : (command as 'archive' | 'trash')
        );
        return;
      }
      if (!current) return;
      if (command === 'open') {
        event.preventDefault();
        options.openThread(current.id);
        return;
      }
      if (command === 'select') {
        event.preventDefault();
        options.setSelected((selected) => {
          const next = new Set(selected);
          if (next.has(current.id)) next.delete(current.id);
          else next.add(current.id);
          return next;
        });
        return;
      }
      if (['reply', 'reply_all', 'forward'].includes(command)) {
        if (current.id !== options.threadId) return;
        event.preventDefault();
        options.reply(command as 'reply' | 'reply_all' | 'forward');
        return;
      }
      if (options.folder === 'drafts') {
        if (command === 'trash' && current.id === options.threadId) {
          event.preventDefault();
          options.deleteDraft();
        }
        return;
      }
      const action: Action | undefined = (
        {
          archive: 'archive',
          trash: 'trash',
          star: current.starred ? 'unstar' : 'star',
          read: 'mark_read',
          unread: 'mark_unread',
        } as Partial<Record<string, Action>>
      )[command];
      if (!action) return;
      event.preventDefault();
      options.action(action, current.id);
    };
    return subscribeMailKeyboard(rootRef.current, onKeyDown);
  });

  return { rootRef, helpOpen, setHelpOpen };
}
