'use client';

import { useQuery } from '@tanstack/react-query';
import { User, Users } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useMiraSoul } from '../hooks/use-mira-soul';
import {
  WORKSPACE_CONTEXT_EVENT,
  WORKSPACE_CONTEXT_STORAGE_KEY_PREFIX,
} from './mira-chat-constants';
import MiraChatPanel from './mira-chat-panel';

interface MiraDashboardClientProps {
  currentUser: {
    id: string;
    display_name?: string | null;
    full_name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
  };
  initialAssistantName: string;
  wsId: string;
  children?: React.ReactNode; // Server-rendered insight widgets
}

function FullscreenGradientBg() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Blob 1 — top-left, purple-indigo */}
      <div
        className="absolute -top-32 -left-32 h-150 w-150 animate-[mira-blob_18s_ease-in-out_infinite] rounded-full opacity-[0.12] blur-[120px] dark:opacity-[0.07]"
        style={{
          background:
            'radial-gradient(circle, var(--color-dynamic-purple) 0%, var(--color-dynamic-indigo) 100%)',
        }}
      />
      {/* Blob 2 — bottom-right, cyan-blue */}
      <div
        className="absolute -right-40 -bottom-40 h-125 w-125 animate-[mira-blob_22s_ease-in-out_infinite_reverse] rounded-full opacity-[0.10] blur-[100px] dark:opacity-[0.06]"
        style={{
          background:
            'radial-gradient(circle, var(--color-dynamic-cyan) 0%, var(--color-dynamic-blue) 100%)',
        }}
      />
      {/* Blob 3 — center-right, pink-rose */}
      <div
        className="absolute top-1/3 right-1/4 h-100 w-100 animate-[mira-blob_15s_ease-in-out_2s_infinite] rounded-full opacity-[0.08] blur-[90px] dark:opacity-[0.05]"
        style={{
          background:
            'radial-gradient(circle, var(--color-dynamic-pink) 0%, var(--color-dynamic-rose) 100%)',
        }}
      />
    </div>
  );
}

interface WorkspaceSummary {
  id: string;
  name?: string | null;
}

function MiraWorkspaceContextBadge({ wsId }: { wsId: string }) {
  const t = useTranslations('dashboard.mira_chat');
  const [workspaceContextId, setWorkspaceContextId] =
    useState<string>('personal');

  useEffect(() => {
    const storageKey = `${WORKSPACE_CONTEXT_STORAGE_KEY_PREFIX}${wsId}`;
    const syncWorkspaceContext = () => {
      const stored = localStorage.getItem(storageKey)?.trim();
      setWorkspaceContextId(stored || 'personal');
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) return;
      syncWorkspaceContext();
    };

    const handleWorkspaceContextChange = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          wsId?: string;
          workspaceContextId?: string;
        }>
      ).detail;
      if (detail?.wsId !== wsId) return;
      syncWorkspaceContext();
    };

    syncWorkspaceContext();
    window.addEventListener('storage', handleStorage);
    window.addEventListener(
      WORKSPACE_CONTEXT_EVENT,
      handleWorkspaceContextChange
    );

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(
        WORKSPACE_CONTEXT_EVENT,
        handleWorkspaceContextChange
      );
    };
  }, [wsId]);

  const { data: workspaces, isLoading } = useQuery({
    queryKey: ['mira-dashboard-workspaces'],
    queryFn: async () => {
      const res = await fetch('/api/workspaces', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`Failed to load workspaces: ${res.status}`);
      }
      return (await res.json()) as WorkspaceSummary[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const workspaceName =
    workspaceContextId === 'personal'
      ? t('workspace_context_personal')
      : workspaces?.find((workspace) => workspace.id === workspaceContextId)
          ?.name ||
        (isLoading
          ? t('workspace_context_loading')
          : t('workspace_context_unknown'));

  const Icon = workspaceContextId === 'personal' ? User : Users;
  const isPersonalWorkspaceContext = workspaceContextId === 'personal';

  const badge = (
    <Badge
      variant="outline"
      title={`${t('workspace_context_label')}: ${workspaceName}`}
      aria-label={`${t('workspace_context_label')}: ${workspaceName}`}
      className={cn(
        'h-8 overflow-hidden border-border/50 bg-background/60 text-foreground text-xs backdrop-blur-sm',
        isPersonalWorkspaceContext
          ? 'w-8 justify-center px-0'
          : 'max-w-35 gap-1.5 px-2'
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {!isPersonalWorkspaceContext ? (
        <span className="truncate">{workspaceName}</span>
      ) : null}
    </Badge>
  );

  if (!isPersonalWorkspaceContext) {
    return badge;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent>
        {t('workspace_context_label')}: {workspaceName}
      </TooltipContent>
    </Tooltip>
  );
}

export default function MiraDashboardClient({
  currentUser,
  initialAssistantName,
  wsId,
  children,
}: MiraDashboardClientProps) {
  const { data: soul } = useMiraSoul();
  const assistantName = soul?.name ?? initialAssistantName;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [chatPanelResetKey, setChatPanelResetKey] = useState(0);

  return (
    <div
      className={cn(
        'relative flex flex-col overflow-hidden',
        isFullscreen
          ? 'fixed inset-0 z-50 bg-background p-3 sm:p-4'
          : 'h-[calc(100vh-5rem)] min-h-0 xl:h-[calc(100vh-2rem)]'
      )}
    >
      {/* Animated gradient backdrop in fullscreen */}
      {isFullscreen && <FullscreenGradientBg />}

      {/* Main layout: semi-fullscreen chat with an in-panel insight dock */}
      <div
        className={cn(
          'relative z-10 flex min-h-0 min-w-0 flex-1 flex-col gap-3 sm:gap-4',
          !isFullscreen && 'xl:h-full'
        )}
      >
        {/* Chat panel — hero element with desktop overlay slot for compact widgets */}
        <div
          className={cn(
            'relative flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden rounded-xl border p-3 pb-0 shadow-sm backdrop-blur-sm sm:p-4',
            isFullscreen
              ? 'border-border/30 bg-card/40'
              : 'border-border/60 bg-card/50'
          )}
        >
          <MiraChatPanel
            key={`${wsId}-${chatPanelResetKey}`}
            wsId={wsId}
            assistantName={assistantName}
            userName={
              currentUser.display_name ||
              currentUser.full_name ||
              currentUser.email ||
              undefined
            }
            userAvatarUrl={currentUser.avatar_url}
            isFullscreen={isFullscreen}
            insightsDock={!isFullscreen ? children : undefined}
            onToggleFullscreen={() => setIsFullscreen((prev) => !prev)}
            onResetPanelState={() =>
              setChatPanelResetKey((current) => current + 1)
            }
            workspaceContextBadge={<MiraWorkspaceContextBadge wsId={wsId} />}
          />
        </div>
      </div>
    </div>
  );
}
