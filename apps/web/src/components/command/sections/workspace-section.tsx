'use client';

import { Building2, ChevronRight, User } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { CommandGroup, CommandItem } from '@tuturuuu/ui/command';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { searchItems } from '../utils/search-scoring';
import type { WorkspaceSearchResult } from '../utils/use-workspace-search';

interface WorkspaceSectionProps {
  workspaces: WorkspaceSearchResult[];
  isLoading: boolean;
  query: string;
  onSelect?: () => void;
}

export function WorkspaceSection({
  workspaces,
  isLoading,
  query,
  onSelect,
}: WorkspaceSectionProps) {
  const router = useRouter();
  const params = useParams();
  const t = useTranslations('command_palette');
  const currentWsId = params.wsId as string | undefined;

  // Filter out current workspace and search through workspaces
  const results = React.useMemo(() => {
    const filtered = workspaces.filter((ws) => ws.id !== currentWsId);

    if (!query.trim()) {
      // Show all workspaces (except current) when no query
      return filtered.map((ws) => ({ item: ws, score: 1000 }));
    }

    // Search through workspace names
    return searchItems(
      filtered.map((ws) => ({
        ...ws,
        title: ws.name,
        searchableText: ws.name,
      })),
      query,
      {
        limit: 10,
        minScore: 100,
      }
    ).map((result) => ({
      item: workspaces.find((ws) => ws.id === result.item.id)!,
      score: result.score,
    }));
  }, [workspaces, currentWsId, query]);

  if (isLoading) {
    return (
      <CommandGroup heading={t('workspaces')}>
        <CommandItem
          disabled
          className="justify-center text-muted-foreground text-sm"
        >
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            {t('loading_workspaces')}
          </div>
        </CommandItem>
      </CommandGroup>
    );
  }

  if (results.length === 0) {
    return null;
  }

  const handleWorkspaceSelect = (workspace: WorkspaceSearchResult) => {
    // Navigate to workspace (preserving locale)
    const locale = params.locale as string | undefined;
    const path = locale ? `/${locale}/${workspace.id}` : `/${workspace.id}`;
    router.push(path);

    // Close command palette
    onSelect?.();
  };

  return (
    <CommandGroup heading={t('workspaces')}>
      {results.map(({ item: workspace }) => (
        <CommandItem
          key={workspace.id}
          value={`workspace-${workspace.id}-${workspace.name}`}
          onSelect={() => handleWorkspaceSelect(workspace)}
          className="flex items-center gap-3"
        >
          {/* Icon */}
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
            {workspace.personal ? (
              <User className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Building2 className="h-4 w-4 text-muted-foreground" />
            )}
          </div>

          {/* Content */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium">{workspace.name}</span>
              {workspace.personal && (
                <Badge
                  variant="outline"
                  className="shrink-0 text-[10px] uppercase"
                >
                  {t('personal')}
                </Badge>
              )}
            </div>
            <span className="truncate text-muted-foreground text-xs capitalize">
              {workspace.role}
            </span>
          </div>

          {/* Indicator */}
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
