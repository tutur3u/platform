'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Brain,
  CheckIcon,
  ChevronDown,
  User,
  Users,
} from '@tuturuuu/icons/lucide';
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
import { fetchWorkspaces } from '../../workspace-list-actions';
import {
  WORKSPACE_CONTEXT_EVENT,
  WORKSPACE_CONTEXT_STORAGE_KEY_PREFIX,
} from './mira-chat-constants';

export function MiraWorkspaceContextSelector({ wsId }: { wsId: string }) {
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
