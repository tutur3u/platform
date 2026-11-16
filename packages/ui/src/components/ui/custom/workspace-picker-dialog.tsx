'use client';

import { Plus, Search, UserPlus, X } from '@tuturuuu/icons';
import type { InternalApiWorkspaceSummary } from '@tuturuuu/types';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import type { useWorkspaceVisibility } from '../../../hooks/use-workspace-visibility';
import { Button } from '../button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '../dialog';
import { useWorkspacePickerPreferences } from './use-workspace-picker-preferences';
import { handlePickerListKey } from './workspace-picker/keyboard';
import {
  orderedPickerRows,
  partitionWorkspaces,
} from './workspace-picker/partition';
import { PickerList } from './workspace-picker/picker-list';
import type { PickerRowContext } from './workspace-picker/picker-section';
import { usePickerVariant } from './workspace-picker/use-picker-variant';

export { useWorkspacePickerShortcut } from './workspace-picker/use-picker-variant';

type Visibility = ReturnType<typeof useWorkspaceVisibility>;
type PickerPreferences = ReturnType<typeof useWorkspacePickerPreferences>;

export function WorkspacePickerDialog({
  open,
  onOpenChange,
  trigger,
  workspaces,
  currentId,
  defaultId,
  visibility,
  preferences,
  onSelect,
  onDefault,
  onCreate,
  onJoin,
  onRetryList,
  listLoading = false,
  listError,
  invitations,
  invitationCount = 0,
  presentation = 'dropdown',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  workspaces: InternalApiWorkspaceSummary[];
  currentId?: string;
  defaultId?: string | null;
  visibility: Visibility;
  preferences?: PickerPreferences;
  onSelect: (workspace: InternalApiWorkspaceSummary) => void;
  onDefault?: (id: string) => void;
  onCreate?: () => void;
  onJoin?: () => void;
  onRetryList?: () => void;
  listLoading?: boolean;
  listError?: Error | null;
  invitations?: ReactNode;
  invitationCount?: number;
  presentation?: 'fullscreen' | 'dropdown';
}) {
  const t = useTranslations('common');
  const listT = useTranslations('command_launcher');
  const variant = usePickerVariant();
  const titleId = useId();
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const localPreferences = useWorkspacePickerPreferences(visibility.actorId);
  const history = preferences ?? localPreferences;
  const [search, setSearch] = useState('');
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const [activeId, setActiveId] = useState('');
  const query = search.trim().toLocaleLowerCase();
  const partition = partitionWorkspaces({
    workspaces,
    hiddenIds: visibility.hiddenIds,
    pinnedIds: history.pinned,
    recentIds: history.recent,
    query,
  });
  const rows = orderedPickerRows(partition, hiddenOpen);
  const firstId = rows[0]?.id ?? '';
  if (
    open &&
    activeId !== firstId &&
    !rows.some((workspace) => workspace.id === activeId)
  ) {
    setActiveId(firstId);
  }

  useEffect(() => {
    if (open) return;
    setSearch('');
    setHiddenOpen(false);
  }, [open]);

  const choose = useCallback(
    (workspace: InternalApiWorkspaceSummary) => {
      history.record(workspace.id);
      onSelect(workspace);
    },
    [history, onSelect]
  );

  function onListKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const id = handlePickerListKey(event, listRef.current);
    if (id) setActiveId(id);
  }

  function onSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    const workspace = rows.find((item) => item.id === activeId) ?? rows[0];
    if (workspace) choose(workspace);
  }

  const context: PickerRowContext = {
    variant,
    activeId,
    currentId,
    defaultId,
    pinnedIds: history.pinned,
    pendingIds: visibility.pending,
    canPinAny: Boolean(visibility.actorId),
    canSetDefault: Boolean(onDefault),
    onActivate: setActiveId,
    onChoose: choose,
    onDefault: (id) => onDefault?.(id),
    onTogglePin: history.togglePin,
    onToggleHidden: (id, hidden) => {
      void visibility.setHidden(id, hidden).catch(() => {});
    },
    t,
  };

  const failed = Boolean(
    listError || visibility.isError || visibility.updateError
  );
  const waiting =
    !visibility.known ||
    ((listLoading || Boolean(listError)) && workspaces.length === 0);
  const showSkeleton = waiting && !listError && !visibility.isError;
  const shortcut =
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)
      ? '⌘⇧K'
      : 'Ctrl+Shift+K';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        aria-labelledby={titleId}
        className={cn(
          'flex flex-col gap-0 overflow-hidden p-0',
          variant === 'dialog' &&
            'max-h-[min(40rem,calc(100vh-2rem))] sm:max-w-xl'
        )}
        data-picker-presentation={presentation}
        data-testid="workspace-picker-dialog"
        data-variant={variant}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const scope =
            event.currentTarget instanceof HTMLElement
              ? event.currentTarget
              : document;
          scope
            .querySelector<HTMLInputElement>(
              '[data-testid="workspace-picker-search"]'
            )
            ?.focus();
        }}
        presentation={variant === 'sheet' ? 'fullscreen' : 'default'}
        role="dialog"
        showCloseButton={false}
      >
        <div className="flex items-center gap-2 border-b py-2 ps-4 pe-2">
          <DialogTitle className="min-w-0 flex-1 text-base" id={titleId}>
            {t('select_workspace')}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t('search_workspace')}
          </DialogDescription>
          <kbd className="hidden rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
            {shortcut}
          </kbd>
          <DialogClose asChild>
            <Button
              aria-label={t('close')}
              className={variant === 'sheet' ? 'size-11' : undefined}
              size="icon"
              type="button"
              variant="ghost"
            >
              <X />
            </Button>
          </DialogClose>
        </div>
        <div
          className="flex min-h-0 flex-1 flex-col"
          onKeyDown={onListKeyDown}
          role="presentation"
        >
          <div className="flex items-center gap-2 border-b px-4 text-muted-foreground focus-within:text-foreground">
            <Search aria-hidden="true" className="size-4 shrink-0" />
            <input
              aria-controls={listId}
              aria-label={t('search_workspace')}
              autoComplete="off"
              className="h-11 min-w-0 flex-1 bg-transparent text-foreground text-sm outline-hidden placeholder:text-muted-foreground"
              data-testid="workspace-picker-search"
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder={t('search_workspace')}
              spellCheck={false}
              type="text"
              value={search}
            />
          </div>
          {failed ? (
            <div
              className="flex items-center gap-3 border-b px-4 py-2"
              role="alert"
            >
              <p className="min-w-0 flex-1 text-sm">
                {listError
                  ? listT('error_workspaces')
                  : visibility.updateError
                    ? t('hidden_workspaces_update_error')
                    : t('hidden_workspaces_load_error')}
              </p>
              <Button
                data-testid="workspace-picker-retry"
                onClick={() => {
                  void visibility.refetch();
                  onRetryList?.();
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                {t('retry')}
              </Button>
            </div>
          ) : null}
          <div
            className={cn(
              'min-h-0 flex-1 overflow-y-auto',
              variant === 'sheet' ? 'pb-2' : 'max-h-[min(28rem,55vh)] pb-1'
            )}
            ref={listRef}
          >
            {showSkeleton ? (
              <div className="space-y-2 p-3" role="status">
                <p className="px-1 text-muted-foreground text-sm">
                  {t('loading')}
                </p>
                {Array.from({ length: 4 }, (_, index) => (
                  <div
                    aria-hidden="true"
                    className="h-12 rounded-lg bg-muted motion-safe:animate-pulse"
                    key={index}
                  />
                ))}
              </div>
            ) : null}
            {waiting ? null : (
              <PickerList
                context={context}
                hiddenCount={visibility.hiddenIds.length}
                hiddenOpen={hiddenOpen}
                label={t('select_workspace')}
                listId={listId}
                onHiddenOpenChange={setHiddenOpen}
                partition={partition}
                query={query}
                totalCount={workspaces.length}
              />
            )}
          </div>
        </div>
        {invitations ? (
          <div
            className="max-h-40 shrink-0 overflow-y-auto border-t"
            data-testid={
              invitationCount > 0
                ? 'workspace-picker-section-invitations'
                : undefined
            }
          >
            {invitations}
          </div>
        ) : null}
        <div className="grid shrink-0 grid-cols-2 gap-2 border-t bg-muted/40 p-3">
          <Button
            className={cn('w-full', variant === 'sheet' && 'min-h-11')}
            data-testid="workspace-picker-join"
            onClick={onJoin}
            type="button"
            variant="outline"
          >
            <UserPlus />
            {t('join_workspace')}
          </Button>
          {onCreate ? (
            <Button
              className={cn('w-full', variant === 'sheet' && 'min-h-11')}
              data-testid="workspace-picker-create"
              onClick={onCreate}
              type="button"
            >
              <Plus />
              {t('create_workspace')}
            </Button>
          ) : (
            <span />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
