'use client';
import {
  ClipboardCheck,
  Ellipsis,
  FileText,
  ListChecks,
  NotebookPen,
  Pencil,
  Plus,
  X,
} from '@tuturuuu/icons';
import type {
  MeetingDocumentKind,
  MeetingDocumentTab,
} from '@tuturuuu/internal-api/meet-call';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Input } from '@tuturuuu/ui/input';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type KeyboardEvent, useState } from 'react';
import { MiraTabDot } from './document-mira-presence';

export const DOCUMENT_KIND_ICONS = {
  doc: FileText,
  notes: NotebookPen,
  rubric: ClipboardCheck,
  summary: ListChecks,
} as const;
const KINDS: MeetingDocumentKind[] = ['doc', 'notes', 'rubric', 'summary'];

export function useDocumentTabTitle() {
  const t = useTranslations('meet.collaboration');
  return (tab: Pick<MeetingDocumentTab, 'id' | 'kind' | 'title'>) =>
    tab.title ?? (tab.id === 'primary' ? t('document') : t(`kind_${tab.kind}`));
}

export function DocumentTabs({
  tabs,
  activeTabId,
  miraTabId,
  canCreate,
  canClose,
  pending,
  onSelect,
  onCreate,
  onRename,
  onClose,
}: {
  tabs: MeetingDocumentTab[];
  activeTabId: string;
  miraTabId?: string;
  canCreate: boolean;
  canClose: (tab: MeetingDocumentTab) => boolean;
  pending: boolean;
  onSelect: (tabId: string) => void;
  onCreate: (kind: MeetingDocumentKind) => void;
  onRename: (tabId: string, title: string | null) => void;
  onClose: (tabId: string) => void;
}) {
  const t = useTranslations('meet.collaboration');
  const title = useDocumentTabTitle();
  const [renaming, setRenaming] = useState<string | null>(null);
  const move = (event: KeyboardEvent, index: number) => {
    const step =
      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = tabs[(index + step + tabs.length) % tabs.length];
    if (next) {
      onSelect(next.id);
      document.getElementById(`meeting-document-tab-${next.id}`)?.focus();
    }
  };
  const commit = (tab: MeetingDocumentTab, value: string) => {
    setRenaming(null);
    const trimmed = value.trim().slice(0, 80);
    if (trimmed !== title(tab)) onRename(tab.id, trimmed || null);
  };
  return (
    <div className="flex shrink-0 items-end gap-1 overflow-x-auto border-border border-b px-3 pt-2.5 [scrollbar-width:none]">
      <div
        role="tablist"
        aria-label={t('documents')}
        className="flex min-w-0 items-end gap-1"
      >
        {tabs.map((tab, index) => {
          const Icon = DOCUMENT_KIND_ICONS[tab.kind];
          const selected = tab.id === activeTabId;
          if (renaming === tab.id)
            return (
              <Input
                key={tab.id}
                autoFocus
                aria-label={t('rename_document')}
                placeholder={t('placeholder_rename_document')}
                defaultValue={title(tab)}
                maxLength={80}
                className="mb-1 h-8 w-44"
                onBlur={(event) => commit(tab, event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter')
                    commit(tab, event.currentTarget.value);
                  if (event.key === 'Escape') setRenaming(null);
                }}
              />
            );
          return (
            <div
              key={tab.id}
              className={cn(
                '-mb-px flex h-10 shrink-0 items-center rounded-t-xl border border-transparent border-b-0',
                selected && 'border-border bg-card'
              )}
            >
              <button
                id={`meeting-document-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => onSelect(tab.id)}
                onDoubleClick={() => setRenaming(tab.id)}
                onKeyDown={(event) => move(event, index)}
                className={cn(
                  'flex h-full items-center gap-2 whitespace-nowrap rounded-t-xl px-3 font-extrabold text-muted-foreground text-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
                  selected && 'text-foreground'
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                <span className="max-w-40 truncate">{title(tab)}</span>
                {miraTabId === tab.id && <MiraTabDot />}
              </button>
              {selected && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="mr-1 size-7 rounded-full"
                      aria-label={t('document_actions', {
                        title: title(tab),
                      })}
                    >
                      <Ellipsis className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onSelect={() => setRenaming(tab.id)}>
                      <Pencil className="size-4" />
                      {t('rename_document')}
                    </DropdownMenuItem>
                    {tab.id !== 'primary' && canClose(tab) && (
                      <DropdownMenuItem
                        variant="destructive"
                        disabled={pending}
                        onSelect={() => onClose(tab.id)}
                      >
                        <X className="size-4" />
                        {t('close_document')}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          );
        })}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="xs"
            className="mb-1.5 ml-1 shrink-0 rounded-full px-3"
            disabled={!canCreate || pending}
            title={canCreate ? undefined : t('document_limit')}
          >
            <Plus className="size-4" />
            {t('new_document')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {KINDS.map((kind) => {
            const Icon = DOCUMENT_KIND_ICONS[kind];
            return (
              <DropdownMenuItem key={kind} onSelect={() => onCreate(kind)}>
                <Icon className="size-4" />
                {t(`kind_${kind}`)}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
