'use client';

import { useQuery } from '@tanstack/react-query';
import { Hash, LoaderCircle, MessageCircle } from '@tuturuuu/icons';
import type { InternalApiWorkspaceSummary } from '@tuturuuu/types';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { ROOT_WORKSPACE_ID, toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { cn } from '@tuturuuu/utils/format';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { fetchWorkspaces } from './actions';

interface ChatContextRailProps {
  closeOnMobile?: () => void;
  collapsed?: boolean;
  onExpand?: () => void;
  wsId: string;
}

export function ChatContextRail({
  closeOnMobile,
  collapsed = false,
  onExpand,
  wsId,
}: ChatContextRailProps) {
  const t = useTranslations('chat');
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeScope =
    searchParams.get('scope') === 'workspaces' ? 'workspaces' : 'personal';
  const workspacesQuery = useQuery({
    queryKey: ['chat-workspaces'],
    queryFn: fetchWorkspaces,
  });
  const workspaces = orderWorkspaces(workspacesQuery.data ?? []);
  const personalWorkspace = workspaces.find((workspace) => workspace.personal);

  function navigate(nextWorkspace: InternalApiWorkspaceSummary, scope: string) {
    if (collapsed) onExpand?.();

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('scope', scope);
    nextParams.delete('conversationId');
    const nextQuery = nextParams.toString();
    const nextSlug = toWorkspaceSlug(nextWorkspace.id, {
      personal: !!nextWorkspace.personal,
    });
    const nextPath = `/${nextSlug}${nextQuery ? `?${nextQuery}` : ''}`;

    if (pathname === `/${nextSlug}`) {
      window.history.replaceState(null, '', nextPath);
    } else {
      router.push(nextPath);
    }

    closeOnMobile?.();
  }

  function selectPersonal() {
    if (personalWorkspace) {
      navigate(personalWorkspace, 'personal');
      return;
    }

    if (collapsed) onExpand?.();

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('scope', 'personal');
    nextParams.delete('conversationId');
    const nextQuery = nextParams.toString();
    window.history.replaceState(
      null,
      '',
      nextQuery ? `${pathname}?${nextQuery}` : pathname
    );
    closeOnMobile?.();
  }

  return (
    <nav
      className={cn(
        'scrollbar-none flex h-full min-h-0 shrink-0 flex-col items-center gap-2 overflow-y-auto overflow-x-hidden overscroll-contain bg-muted/20 px-2 py-3',
        collapsed ? 'w-full' : 'w-14 border-r'
      )}
    >
      <RailButton
        active={activeScope === 'personal'}
        label={t('scope_personal')}
        onClick={selectPersonal}
      >
        <MessageCircle className="size-5" />
      </RailButton>

      <div className="my-1 h-px w-8 bg-border" />

      {workspacesQuery.isLoading ? (
        <LoaderCircle className="mt-2 size-4 animate-spin text-muted-foreground" />
      ) : (
        workspaces.map((workspace) => (
          <WorkspaceRailButton
            active={activeScope === 'workspaces' && workspace.id === wsId}
            key={workspace.id}
            onClick={() => navigate(workspace, 'workspaces')}
            workspace={workspace}
          />
        ))
      )}
    </nav>
  );
}

function getWorkspaceRank(workspace: InternalApiWorkspaceSummary) {
  if (workspace.id === ROOT_WORKSPACE_ID) return 0;
  if (workspace.personal) return 1;
  return 2;
}

function orderWorkspaces(workspaces: InternalApiWorkspaceSummary[]) {
  return [...workspaces].sort((left, right) => {
    const rankDelta = getWorkspaceRank(left) - getWorkspaceRank(right);
    if (rankDelta !== 0) return rankDelta;

    return (left.name || '').localeCompare(right.name || '');
  });
}

function RailButton({
  active,
  children,
  label,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          className={cn(
            'size-10 rounded-md p-0 transition-colors',
            active
              ? 'bg-foreground text-background hover:bg-foreground/90'
              : 'bg-background hover:bg-accent'
          )}
          onClick={onClick}
          type="button"
          variant="ghost"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function WorkspaceRailButton({
  active,
  onClick,
  workspace,
}: {
  active: boolean;
  onClick: () => void;
  workspace: InternalApiWorkspaceSummary;
}) {
  const name = workspace.name || 'Workspace';
  const avatarUrl = workspace.avatar_url || workspace.logo_url;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={name}
          className={cn(
            'relative flex size-10 items-center justify-center rounded-md border bg-background transition-colors hover:bg-accent',
            active && 'border-foreground bg-accent'
          )}
          onClick={onClick}
          type="button"
        >
          {active ? (
            <span className="absolute -left-2 h-6 w-1 rounded-r-full bg-foreground" />
          ) : null}
          <Avatar className="size-8 rounded-sm">
            <AvatarImage alt={name} src={avatarUrl ?? undefined} />
            <AvatarFallback className="rounded-sm">
              {name ? getInitials(name) : <Hash className="size-4" />}
            </AvatarFallback>
          </Avatar>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{name}</TooltipContent>
    </Tooltip>
  );
}
