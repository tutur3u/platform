'use client';

import { useQuery } from '@tanstack/react-query';
import { Brain, CheckIcon, ChevronDown, User, Users } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@tuturuuu/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { normalizeWorkspaceContextId } from '@tuturuuu/utils/constants';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { fetchWorkspaces } from '../../actions';
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

function MiraWorkspaceContextSelector({ wsId }: { wsId: string }) {
  const t = useTranslations('dashboard.mira_chat');
  const [workspaceContextId, setWorkspaceContextId] =
    useState<string>('personal');
  const [open, setOpen] = useState(false);

  const storageKey = `${WORKSPACE_CONTEXT_STORAGE_KEY_PREFIX}${wsId}`;

  useEffect(() => {
    const syncWorkspaceContext = () => {
      const stored = localStorage.getItem(storageKey);
      setWorkspaceContextId(normalizeWorkspaceContextId(stored));
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
      // Read directly from event detail instead of localStorage to avoid
      // timing issues where the persistence effect hasn't flushed yet.
      const next = normalizeWorkspaceContextId(detail.workspaceContextId);
      setWorkspaceContextId(next);
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
  }, [wsId, storageKey]);

  const { data: workspaces, isLoading } = useQuery({
    queryKey: ['mira-dashboard-workspaces'],
    queryFn: () => fetchWorkspaces(),
    staleTime: 5 * 60 * 1000,
  });

  const selectContext = useCallback(
    (newContextId: string) => {
      const normalizedContextId = normalizeWorkspaceContextId(newContextId);
      localStorage.setItem(storageKey, normalizedContextId);
      setWorkspaceContextId(normalizedContextId);
      window.dispatchEvent(
        new CustomEvent(WORKSPACE_CONTEXT_EVENT, {
          detail: { wsId, workspaceContextId: normalizedContextId },
        })
      );
      setOpen(false);
    },
    [wsId, storageKey]
  );

  const personalWorkspace = workspaces?.find((ws) => ws.personal);
  const sharedWorkspaces =
    workspaces?.filter((ws) => !ws.personal && ws.name) || [];

  const personalLabel =
    personalWorkspace?.name || t('workspace_context_personal');

  const workspaceName =
    workspaceContextId === 'personal'
      ? t('workspace_context_personal')
      : workspaces?.find((workspace) => workspace.id === workspaceContextId)
          ?.name ||
        (isLoading
          ? t('workspace_context_loading')
          : t('workspace_context_unknown'));

  const Icon = Brain;
  const isPersonalWorkspaceContext = workspaceContextId === 'personal';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn(
            'h-8 gap-1.5 border-border/50 bg-background/60 text-xs backdrop-blur-sm',
            isPersonalWorkspaceContext ? 'px-2' : 'max-w-40 px-2'
          )}
          aria-label={t('workspace_context_select')}
        >
          <Icon className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">{workspaceName}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-0" align="end">
        <Command>
          <CommandInput placeholder={t('workspace_context_search')} />
          <CommandEmpty>{t('workspace_context_unknown')}</CommandEmpty>
          <CommandList className="max-h-56">
            <CommandGroup heading={t('workspace_context_personal')}>
              <CommandItem
                value={`${personalLabel} personal`}
                onSelect={() => selectContext('personal')}
                className="gap-2 text-sm"
              >
                <User className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{personalLabel}</span>
                <CheckIcon
                  className={cn(
                    'ml-auto h-3.5 w-3.5 shrink-0',
                    isPersonalWorkspaceContext ? 'opacity-100' : 'opacity-0'
                  )}
                />
              </CommandItem>
            </CommandGroup>
            {sharedWorkspaces.length > 0 && (
              <CommandGroup heading={t('workspace_context_shared')}>
                {sharedWorkspaces.map((ws) => (
                  <CommandItem
                    key={ws.id}
                    value={`${ws.name} ${ws.id}`}
                    onSelect={() => selectContext(ws.id)}
                    className="gap-2 text-sm"
                  >
                    <Users className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{ws.name}</span>
                    <CheckIcon
                      className={cn(
                        'ml-auto h-3.5 w-3.5 shrink-0',
                        workspaceContextId === ws.id
                          ? 'opacity-100'
                          : 'opacity-0'
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
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
          : 'h-[calc(100vh-5rem)] min-h-0 md:h-[calc(100vh-2rem)]'
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
            workspaceContextBadge={<MiraWorkspaceContextSelector wsId={wsId} />}
          />
        </div>
      </div>
    </div>
  );
}
