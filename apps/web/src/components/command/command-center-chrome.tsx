'use client';

import { CornerDownLeft, ListTodo, Plus, Sparkles } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

export function CommandCenterHeader({
  modKey,
  workspaceName,
}: {
  modKey: string;
  workspaceName?: string;
}) {
  const t = useTranslations('command_palette');
  return (
    <div className="flex items-center justify-between gap-4 border-b bg-muted/15 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border bg-background shadow-xs">
          <ListTodo className="size-4.5 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate font-semibold text-sm">{t('title')}</h2>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-[10px] text-primary uppercase tracking-wide">
              {t('task_first')}
            </span>
          </div>
          <p className="truncate text-muted-foreground text-xs">
            {workspaceName ?? t('description')}
          </p>
        </div>
      </div>
      <kbd className="hidden h-6 shrink-0 items-center gap-1 rounded-md border bg-background px-2 font-mono text-[10px] text-muted-foreground shadow-xs sm:inline-flex">
        {modKey} K
      </kbd>
    </div>
  );
}

export function CommandCenterEmpty({
  canCreateTask,
  onCreateTask,
  query,
}: {
  canCreateTask: boolean;
  onCreateTask: () => void;
  query: string;
}) {
  const t = useTranslations('command_palette');
  const trimmedQuery = query.trim();
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl border bg-muted/40 shadow-xs">
        <Sparkles className="size-5 text-muted-foreground" />
      </div>
      <div className="max-w-sm space-y-1">
        <p className="font-medium">{t('empty.title')}</p>
        <p className="text-muted-foreground text-sm">
          {trimmedQuery
            ? t('empty.no_matches', { query: trimmedQuery })
            : t('empty.description')}
        </p>
      </div>
      {canCreateTask && trimmedQuery ? (
        <Button type="button" size="sm" onClick={onCreateTask}>
          <Plus className="size-4" />
          {t('create_from_query', { query: trimmedQuery.slice(0, 36) })}
        </Button>
      ) : null}
    </div>
  );
}

export function CommandCenterFooter({ modKey }: { modKey: string }) {
  const t = useTranslations('command_palette');
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 overflow-x-auto border-t bg-muted/20 px-4 py-2 text-muted-foreground text-xs">
      <div className="flex shrink-0 items-center gap-3">
        <Hint keys="↑↓" label={t('keyboard_hints.navigate')} />
        <Hint
          icon={<CornerDownLeft className="size-3" />}
          label={t('keyboard_hints.open')}
        />
        <Hint keys={`${modKey}↵`} label={t('keyboard_hints.create')} />
      </div>
      <div className="hidden shrink-0 items-center gap-2 md:flex">
        <Prefix prefix="#" label={t('power_hints.tasks')} />
        <Prefix prefix="/" label={t('power_hints.pages')} />
        <Prefix prefix=">" label={t('power_hints.actions')} />
      </div>
    </div>
  );
}

function Hint({
  icon,
  keys,
  label,
}: {
  icon?: ReactNode;
  keys?: string;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <kbd className="flex min-h-5 min-w-5 items-center justify-center rounded border bg-background px-1 font-mono text-[10px]">
        {icon ?? keys}
      </kbd>
      <span>{label}</span>
    </span>
  );
}

function Prefix({ prefix, label }: { prefix: string; label: string }) {
  return (
    <span>
      <kbd className="mr-1 rounded border bg-background px-1 font-mono text-[10px]">
        {prefix}
      </kbd>
      {label}
    </span>
  );
}
