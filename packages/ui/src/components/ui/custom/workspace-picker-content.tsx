'use client';

import {
  ArrowLeft,
  Eye,
  EyeOff,
  Pin,
  Plus,
  Search,
  Star,
  X,
} from '@tuturuuu/icons';
import type { InternalApiWorkspaceSummary } from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type KeyboardEvent, type ReactNode, useRef, useState } from 'react';
import type { useWorkspaceVisibility } from '../../../hooks/use-workspace-visibility';
import { Button } from '../button';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../dialog';
import { Input } from '../input';
import { PopoverClose, PopoverContent } from '../popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '../tooltip';
import { useWorkspacePickerPreferences } from './use-workspace-picker-preferences';
import { TUTURUUU_LOGO_URL } from './tuturuuu-logo';
import { WorkspaceIcon } from './workspace-select-icon';

type Visibility = ReturnType<typeof useWorkspaceVisibility>;
export function WorkspacePickerContent(
  props: Parameters<typeof WorkspacePickerContentInner>[0]
) {
  return (
    <WorkspacePickerContentInner
      key={props.visibility.actorId ?? 'signed-out'}
      {...props}
    />
  );
}

function WorkspacePickerContentInner({
  preferences,
  workspaces,
  currentId,
  defaultId,
  visibility,
  onSelect,
  onDefault,
  onCreate,
  onJoin,
  invitations,
  restoreOnly = false,
  listLoading = false,
  listError,
  onRetryList,
  presentation = 'fullscreen',
  onClose,
}: {
  preferences?: ReturnType<typeof useWorkspacePickerPreferences>;
  workspaces: InternalApiWorkspaceSummary[];
  currentId?: string;
  defaultId?: string | null;
  visibility: Visibility;
  onSelect: (workspace: InternalApiWorkspaceSummary) => void;
  onDefault?: (id: string) => void;
  onCreate?: () => void;
  onJoin?: () => void;
  invitations?: ReactNode;
  restoreOnly?: boolean;
  listLoading?: boolean;
  listError?: Error | null;
  onRetryList?: () => void;
  presentation?: 'fullscreen' | 'dropdown';
  onClose?: () => void;
}) {
  const dropdown = presentation === 'dropdown';
  const Title = dropdown ? 'h2' : DialogTitle;
  const Description = dropdown ? 'p' : DialogDescription;
  const t = useTranslations('common');
  const listT = useTranslations('command_launcher');
  const [restoring, setRestoring] = useState(restoreOnly);
  const [searchVisible, setSearchVisible] = useState(true);
  const [search, setSearch] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const localPreferences = useWorkspacePickerPreferences(visibility.actorId);
  const history = preferences ?? localPreferences;
  const list = useRef<HTMLDivElement>(null);
  function moveFocus(event: KeyboardEvent<HTMLElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    if (event.target === input.current && ['Home', 'End'].includes(event.key))
      return;
    const buttons = Array.from(
      list.current?.querySelectorAll<HTMLButtonElement>(
        '[data-workspace-choice]:not(:disabled)'
      ) ?? []
    );
    if (!buttons.length) return;
    event.preventDefault();
    const index = buttons.findIndex(
      (button) => button === document.activeElement
    );
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : event.key === 'ArrowDown'
            ? (index + 1) % buttons.length
            : (index <= 0 ? buttons.length : index) - 1;
    buttons[next]?.focus();
  }
  const query = search.trim().toLocaleLowerCase();
  const choices = workspaces.filter(
    (workspace) => visibility.hiddenIds.includes(workspace.id) === restoring
  );
  const results = choices
    .filter((workspace) =>
      [workspace.name, workspace.id, workspace.tier].some((value) =>
        value?.toLocaleLowerCase().includes(query)
      )
    )
    .sort((a, b) => {
      const rank = (w: InternalApiWorkspaceSummary) =>
        history.pinned.includes(w.id)
          ? 0
          : history.recent.includes(w.id)
            ? 1
            : w.id === ROOT_WORKSPACE_ID
              ? 2
              : w.personal
                ? 3
                : 4;
      return (
        rank(a) - rank(b) ||
        (rank(a) === 1
          ? history.recent.indexOf(a.id) - history.recent.indexOf(b.id)
          : 0) ||
        (a.name ?? '').localeCompare(b.name ?? '') ||
        a.id.localeCompare(b.id)
      );
    });
  function openSearch() {
    setSearchVisible(true);
    requestAnimationFrame(() => input.current?.focus());
  }
  const content = (
    <>
      <div
        className={cn(
          'flex items-center gap-3 border-b p-4',
          !dropdown && 'pt-[max(1rem,env(safe-area-inset-top))]'
        )}
      >
        {restoring && !restoreOnly && (
          <Button
            size="icon"
            variant="ghost"
            aria-label={t('back')}
            onClick={() => {
              setRestoring(false);
              setSearch('');
            }}
          >
            <ArrowLeft />
          </Button>
        )}
        <WorkspaceIcon fallbackLogoUrl={TUTURUUU_LOGO_URL} name="Tuturuuu" />
        <Title className="min-w-0 flex-1 font-semibold text-lg leading-none">
          {restoring ? t('hidden_workspaces') : t('workspaces')}
        </Title>
        {dropdown ? (
          <PopoverClose asChild>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t('close')}
              onClick={onClose}
            >
              <X />
            </Button>
          </PopoverClose>
        ) : (
          <DialogClose asChild>
            <Button size="icon" variant="ghost" aria-label={t('close')}>
              <X />
            </Button>
          </DialogClose>
        )}
      </div>
      <Description className={restoring ? 'px-4 pt-3' : 'sr-only'}>
        {restoring ? t('hidden_workspaces_description') : t('select_workspace')}
      </Description>
      {searchVisible && (
        <div className="px-4 pt-3">
          <div className="relative">
            <Input
              ref={input}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('search_workspace')}
              aria-label={t('search_workspace')}
              onKeyDown={moveFocus}
              className="h-9 pr-10"
            />
            {query && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute inset-y-0 right-0"
                aria-label={t('clear_search')}
                onClick={() => {
                  setSearch('');
                  input.current?.focus();
                }}
              >
                <X />
              </Button>
            )}
          </div>
        </div>
      )}
      {(visibility.isError || visibility.updateError || listError) && (
        <div role="alert" className="flex items-center gap-3 px-4 pt-3">
          <p className="flex-1">
            {listError
              ? listT('error_workspaces')
              : visibility.updateError
                ? t('hidden_workspaces_update_error')
                : t('hidden_workspaces_load_error')}
          </p>
          <Button
            variant="outline"
            onClick={() => {
              void visibility.refetch();
              onRetryList?.();
            }}
          >
            {t('retry')}
          </Button>
        </div>
      )}
      <div
        ref={list}
        onKeyDown={moveFocus}
        className={cn(
          'min-h-0 flex-1 overflow-y-auto px-4 pt-4',
          dropdown ? 'pb-3' : 'pb-28'
        )}
      >
        {!visibility.known ||
        ((listLoading || listError) && workspaces.length === 0) ? (
          <div role="status" className="min-h-64 space-y-3">
            <p>
              {listError
                ? listT('error_workspaces')
                : visibility.isError
                  ? t('hidden_workspaces_load_error')
                  : t('loading')}
            </p>
            {!listError &&
              !visibility.isError &&
              Array.from({ length: 4 }, (_, index) => (
                <div
                  key={index}
                  aria-hidden="true"
                  className="h-12 rounded-lg bg-muted motion-safe:animate-pulse"
                />
              ))}
          </div>
        ) : (
          <>
            {!restoring && invitations}
            {results.map((workspace) => (
              <div
                key={workspace.id}
                className={cn(
                  'flex items-center gap-2',
                  'rounded-lg transition-colors duration-150 hover:bg-muted/60 motion-reduce:transition-none',
                  workspace.id === currentId && 'bg-accent',
                  dropdown ? 'mb-1' : 'mb-2 border p-2'
                )}
              >
                {restoring ? (
                  <div className="flex min-w-0 flex-1 items-center gap-3 p-2">
                    <WorkspaceIcon
                      name={workspace.name ?? ''}
                      avatarUrl={workspace.avatar_url ?? undefined}
                    />
                    <span className="truncate">{workspace.name}</span>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    className={cn(
                      'h-auto min-w-0 flex-1 justify-start gap-3 whitespace-normal text-start',
                      dropdown ? 'py-2' : 'py-3'
                    )}
                    aria-label={[
                      workspace.name ?? workspace.id,
                      workspace.tier ?? 'FREE',
                      workspace.id === currentId
                        ? t('current_workspace')
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    data-workspace-choice
                    title={workspace.name ?? workspace.id}
                    onClick={() => {
                      history.record(workspace.id);
                      onSelect(workspace);
                    }}
                  >
                    <WorkspaceIcon
                      name={workspace.name ?? ''}
                      avatarUrl={workspace.avatar_url ?? undefined}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{workspace.name}</span>
                      <span className="block truncate text-muted-foreground text-xs">
                        {history.pinned.includes(workspace.id)
                          ? `${t('picker_pinned')} · `
                          : history.recent.includes(workspace.id)
                            ? `${t('picker_recent')} · `
                            : ''}
                        {workspace.tier ?? 'FREE'}
                        {workspace.id === currentId
                          ? ` · ${t('current_workspace')}`
                          : ''}
                        {workspace.access_type === 'guest'
                          ? ` · ${t('guest_access')}`
                          : ''}
                      </span>
                    </span>
                  </Button>
                )}
                {!restoring && visibility.actorId && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`${t(history.pinned.includes(workspace.id) ? 'picker_unpin' : 'picker_pin')}: ${workspace.name}`}
                        aria-pressed={history.pinned.includes(workspace.id)}
                        onClick={() => history.togglePin(workspace.id)}
                      >
                        <Pin
                          className={
                            history.pinned.includes(workspace.id)
                              ? 'fill-current'
                              : ''
                          }
                        />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="motion-reduce:animate-none">
                      {t(
                        history.pinned.includes(workspace.id)
                          ? 'picker_unpin'
                          : 'picker_pin'
                      )}
                    </TooltipContent>
                  </Tooltip>
                )}
                {!restoring &&
                  workspace.access_type !== 'guest' &&
                  onDefault && (
                    <Button
                      size="icon"
                      variant="ghost"
                      title={t('default_workspace')}
                      aria-label={t('default_workspace')}
                      disabled={workspace.id === defaultId}
                      onClick={() => onDefault(workspace.id)}
                    >
                      <Star
                        className={
                          workspace.id === defaultId ? 'fill-current' : ''
                        }
                      />
                    </Button>
                  )}
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`${t(restoring ? 'restore_workspace' : 'hide_workspace')}: ${workspace.name}`}
                  title={t(restoring ? 'restore_workspace' : 'hide_workspace')}
                  disabled={visibility.pending.has(workspace.id)}
                  onClick={() => {
                    void visibility
                      .setHidden(workspace.id, !restoring)
                      .catch(() => {});
                  }}
                >
                  {restoring ? <Eye /> : <EyeOff />}
                </Button>
              </div>
            ))}
            {!results.length && (
              <p role="status" className="py-8 text-center">
                {query
                  ? t('no_workspace_found')
                  : restoring
                    ? t('hidden_workspaces_empty')
                    : workspaces.length
                      ? t('all_workspaces_hidden')
                      : t('no_workspace_found')}
              </p>
            )}
          </>
        )}
        {!restoring && (
          <Button
            variant="link"
            onClick={() => {
              setRestoring(true);
              setSearch('');
            }}
          >
            {t('hidden_workspaces')}
          </Button>
        )}
        {!restoring && onJoin && (
          <Button variant="link" onClick={onJoin}>
            {t('join_workspace_action')}
          </Button>
        )}
      </div>
      <div
        className={
          dropdown
            ? restoring || !onCreate
              ? 'hidden'
              : 'flex gap-2 border-t p-2'
            : 'absolute right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] flex gap-3 rounded-full border bg-background p-2 shadow-lg'
        }
      >
        {!dropdown && (
          <Button
            size="icon"
            className="rounded-full"
            aria-label={t('search_workspace')}
            onClick={openSearch}
          >
            <Search />
          </Button>
        )}
        {!restoring && onCreate && (
          <Button
            size={dropdown ? 'sm' : 'icon'}
            className={dropdown ? 'w-full justify-start' : 'rounded-full'}
            aria-label={t('create_workspace_action')}
            onClick={onCreate}
          >
            <Plus />
            {dropdown && t('create_workspace_action')}
          </Button>
        )}
      </div>
    </>
  );
  return dropdown ? (
    <PopoverContent
      align="start"
      aria-label={t(restoring ? 'hidden_workspaces' : 'workspaces')}
      collisionPadding={8}
      className="flex h-[32rem] max-h-[min(32rem,var(--radix-popover-content-available-height))] w-80 max-w-[min(calc(100vw-1rem),var(--radix-popover-content-available-width))] flex-col overflow-hidden p-0 motion-reduce:animate-none"
    >
      {content}
    </PopoverContent>
  ) : (
    <DialogContent
      presentation="fullscreen"
      showCloseButton={false}
      className="flex-col motion-reduce:animate-none"
    >
      {content}
    </DialogContent>
  );
}
