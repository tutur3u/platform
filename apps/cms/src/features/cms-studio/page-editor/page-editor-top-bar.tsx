'use client';

import { ArrowLeft, Eye, MoreHorizontal, Send } from '@tuturuuu/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import type { PageEditorLabels } from './page-editor-labels';
import type { PageEditorSaveState } from './page-editor-model';
import { ieeai } from './page-editor-theme';
import { SaveStateIndicator } from './save-state-indicator';

export type PageEditorAction = {
  id: string;
  label: string;
  icon?: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

export type PageEditorTopBarProps = {
  labels: PageEditorLabels;
  title: string;
  /** Where the page lives, e.g. the collection name. */
  context?: string;
  status: { label: string; live: boolean };
  /** Extra facts next to the status, e.g. "Cover" or "Processing media". */
  badges?: readonly { id: string; label: string }[];
  saveState: PageEditorSaveState;
  onRetrySave?: () => void;
  /** Omitted where the surrounding chrome already closes the editor. */
  back?: { label: string; onBack: () => void };
  save?: { label: string; disabled: boolean; onSave: () => void };
  preview?: { label: string; onPreview: () => void };
  publish?: {
    label: string;
    pending: boolean;
    onPublish: () => void;
  };
  moreActionsLabel: string;
  /** Overflow menu, e.g. duplicate or delete the page. Empty: no menu. */
  actions?: readonly PageEditorAction[];
};

export function PageEditorTopBar({
  labels,
  title,
  context,
  status,
  badges = [],
  saveState,
  onRetrySave,
  back,
  save,
  preview,
  publish,
  moreActionsLabel,
  actions = [],
}: PageEditorTopBarProps) {
  const regular = actions.filter((action) => !action.destructive);
  const destructive = actions.filter((action) => action.destructive);

  return (
    <header className="mx-auto flex w-full max-w-[1480px] flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6 lg:px-8">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {back ? (
          <button
            type="button"
            className={cn(ieeai.iconButton, ieeai.focus, 'size-9 shrink-0')}
            aria-label={back.label}
            title={back.label}
            onClick={back.onBack}
          >
            <ArrowLeft className="size-4" aria-hidden />
          </button>
        ) : null}
        <span
          aria-hidden
          className="hidden h-8 w-1 shrink-0 rounded-full bg-[var(--ieeai-yellow)] sm:block"
        />
        <div className="min-w-0">
          {context ? (
            <p className="truncate text-[var(--ieeai-subtle)] text-xs">
              {context}
            </p>
          ) : null}
          <h1 className={cn(ieeai.heading, 'truncate text-lg sm:text-xl')}>
            {title}
          </h1>
        </div>
        <span
          className={cn(
            'inline-flex shrink-0 rounded-full px-2.5 py-0.5 font-semibold text-xs',
            status.live
              ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
              : 'bg-[var(--ieeai-surface-2)] text-[var(--ieeai-muted)]'
          )}
        >
          {status.label}
        </span>
        {badges.map((badge) => (
          <span
            key={badge.id}
            className="hidden shrink-0 rounded-full px-2.5 py-0.5 text-[var(--ieeai-muted)] text-xs ring-1 ring-[var(--ieeai-border)] md:inline-flex"
          >
            {badge.label}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SaveStateIndicator
          state={saveState}
          labels={labels}
          onRetry={onRetrySave}
        />
        {save ? (
          <button
            type="button"
            className={cn(ieeai.pillSecondary, ieeai.focus, 'h-9')}
            disabled={save.disabled}
            onClick={save.onSave}
          >
            {save.label}
          </button>
        ) : null}
        {preview ? (
          <button
            type="button"
            className={cn(ieeai.pillSecondary, ieeai.focus, 'h-9 px-3 sm:px-4')}
            onClick={preview.onPreview}
          >
            <Eye className="size-4" aria-hidden />
            <span className="sr-only sm:not-sr-only">{preview.label}</span>
          </button>
        ) : null}
        {publish ? (
          <button
            type="button"
            className={cn(ieeai.pillPrimary, ieeai.focus, 'h-9')}
            disabled={publish.pending}
            aria-busy={publish.pending || undefined}
            onClick={publish.onPublish}
          >
            <Send className="size-4" aria-hidden />
            {publish.label}
          </button>
        ) : null}
        {actions.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(ieeai.iconButton, ieeai.focus, 'size-9')}
                aria-label={moreActionsLabel}
                title={moreActionsLabel}
              >
                <MoreHorizontal className="size-4" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {regular.map((action) => (
                <DropdownMenuItem
                  key={action.id}
                  disabled={action.disabled}
                  onSelect={action.onSelect}
                >
                  {action.icon}
                  {action.label}
                </DropdownMenuItem>
              ))}
              {regular.length > 0 && destructive.length > 0 ? (
                <DropdownMenuSeparator />
              ) : null}
              {destructive.map((action) => (
                <DropdownMenuItem
                  key={action.id}
                  disabled={action.disabled}
                  className="text-red-700 focus:text-red-700"
                  onSelect={action.onSelect}
                >
                  {action.icon}
                  {action.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </header>
  );
}
