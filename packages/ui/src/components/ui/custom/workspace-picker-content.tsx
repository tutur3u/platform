'use client';

import { ArrowLeft, Eye, EyeOff, Plus, Search, Star, X } from '@tuturuuu/icons';
import type { InternalApiWorkspaceSummary } from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type ReactNode, useRef, useState } from 'react';
import type { useWorkspaceVisibility } from '../../../hooks/use-workspace-visibility';
import { Button } from '../button';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../dialog';
import { Input } from '../input';
import { PopoverContent } from '../popover';
import { TUTURUUU_LOGO_URL } from './tuturuuu-logo';
import { WorkspaceIcon } from './workspace-select-icon';

type Visibility = ReturnType<typeof useWorkspaceVisibility>;
export function WorkspacePickerContent({
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
  const [restoring, setRestoring] = useState(restoreOnly);
  const [searchVisible, setSearchVisible] = useState(dropdown);
  const [search, setSearch] = useState('');
  const input = useRef<HTMLInputElement>(null);
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
        w.id === ROOT_WORKSPACE_ID ? 0 : w.personal ? 1 : 2;
      return (
        rank(a) - rank(b) ||
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
          <Button
            size="icon"
            variant="ghost"
            aria-label={t('close')}
            onClick={onClose}
          >
            <X />
          </Button>
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
        <div className="flex gap-2 px-4 pt-3">
          <Input
            ref={input}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('search_workspace')}
            aria-label={t('search_workspace')}
          />
          {query && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearch('');
                input.current?.focus();
              }}
            >
              {t('clear_search')}
            </Button>
          )}
        </div>
      )}
      {(visibility.isError || visibility.updateError || listError) && (
        <div role="alert" className="flex items-center gap-3 px-4 pt-3">
          <p className="flex-1">
            {visibility.updateError
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
        className={cn(
          'min-h-0 flex-1 overflow-y-auto px-4 pt-4',
          dropdown ? 'pb-3' : 'pb-28'
        )}
      >
        {!visibility.known || listLoading || listError ? (
          <p role="status">
            {visibility.isError || listError
              ? t('hidden_workspaces_load_error')
              : t('loading')}
          </p>
        ) : (
          <>
            {!restoring && invitations}
            {results.map((workspace) => (
              <div
                key={workspace.id}
                className={cn(
                  'flex items-center gap-2',
                  dropdown ? 'mb-1 rounded-md' : 'mb-2 rounded-xl border p-2'
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
                    onClick={() => onSelect(workspace)}
                  >
                    <WorkspaceIcon
                      name={workspace.name ?? ''}
                      avatarUrl={workspace.avatar_url ?? undefined}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words">
                        {workspace.name}
                      </span>
                      <span className="text-muted-foreground text-xs">
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
                {!restoring &&
                  workspace.access_type !== 'guest' &&
                  onDefault && (
                    <Button
                      size="icon"
                      variant="ghost"
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
      className="flex max-h-[min(32rem,var(--radix-popover-content-available-height))] w-80 max-w-[min(calc(100vw-1rem),var(--radix-popover-content-available-width))] flex-col overflow-hidden p-0"
    >
      {content}
    </PopoverContent>
  ) : (
    <DialogContent
      presentation="fullscreen"
      showCloseButton={false}
      className="flex-col"
    >
      {content}
    </DialogContent>
  );
}
