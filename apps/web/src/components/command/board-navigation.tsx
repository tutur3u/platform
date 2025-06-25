'use client';

import type { Board } from './types';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@tuturuuu/ui/button';
import { CommandGroup, CommandItem } from '@tuturuuu/ui/command';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  LayoutDashboard,
  Loader,
  MapPin,
  Plus,
  RefreshCw,
  Tag,
} from '@tuturuuu/ui/icons';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import React from 'react';

interface Board {
  id: string;
  name: string;
  task_lists?: { id: string; name: string }[];
}

interface BoardNavigationProps {
  wsId: string;
  setOpen: (open: boolean) => void;
}

export function BoardNavigation({ wsId, setOpen }: BoardNavigationProps) {
  const [isExpanded, setIsExpanded] = React.useState(true);

  const {
    data: boardsData,
    isLoading: boardsLoading,
    error: boardsError,
    refetch,
  } = useQuery<{
    boards: Board[];
  }>({
    queryKey: ['boards', wsId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/boards`);
      if (!response.ok) throw new Error('Failed to fetch boards');
      return response.json();
    },
    retry: 2,
    retryDelay: 1000,
  });

  const boards = boardsData?.boards || [];

  const getBoardColor = (boardId: string) => {
    const colors = [
      'bg-dynamic-blue/10 border-dynamic-blue/20 text-dynamic-blue',
      'bg-dynamic-green/10 border-dynamic-green/20 text-dynamic-green',
      'bg-dynamic-purple/10 border-dynamic-purple/20 text-dynamic-purple',
      'bg-dynamic-orange/10 border-dynamic-orange/20 text-dynamic-orange',
      'bg-dynamic-pink/10 border-dynamic-pink/20 text-dynamic-pink',
    ];
    const hash = boardId.split('').reduce((a, b) => {
      a = (a << 5) - a + b.charCodeAt(0);
      return a & a;
    }, 0);
    return colors[Math.abs(hash) % colors.length];
  };

  const handleBoardSelect = (boardId: string) => {
    // Navigate to the board
    window.location.href = `/${wsId}/tasks/boards/${boardId}`;
    setOpen(false);
  };

  // Loading state
  if (boardsLoading) {
    return (
      <div className="border-b border-border/50 pb-2">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              📋 Board Navigation
            </span>
            <Loader className="h-3 w-3 animate-spin text-dynamic-blue" />
          </div>
        </div>
        <div className="flex items-center justify-center p-6">
          <div className="flex items-center gap-2">
            <Loader className="h-4 w-4 animate-spin text-dynamic-blue" />
            <span className="text-sm text-muted-foreground">
              Loading boards...
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (boardsError) {
    return (
      <div className="border-b border-border/50 pb-2">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              📋 Board Navigation
            </span>
            <div className="rounded-md bg-dynamic-red/10 px-2 py-0.5 text-xs font-medium text-dynamic-red">
              Error
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center gap-3 p-6 text-center">
          <div className="rounded-full bg-dynamic-red/10 p-3">
            <AlertTriangle className="h-5 w-5 text-dynamic-red" />
          </div>
          <div className="space-y-1">
            <p className="font-semibold text-foreground">
              Failed to load boards
            </p>
            <p className="text-xs text-muted-foreground">
              {boardsError.message || 'Unable to fetch boards at the moment'}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="gap-2"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // No boards state
  if (!boards || boards.length === 0) {
    return (
      <div className="border-b border-border/50 pb-2">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              📋 Board Navigation
            </span>
            <div className="rounded-md bg-dynamic-orange/10 px-2 py-0.5 text-xs font-medium text-dynamic-orange">
              0 boards
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center gap-3 p-6 text-center">
          <div className="rounded-full bg-dynamic-blue/10 p-3">
            <LayoutDashboard className="h-5 w-5 text-dynamic-blue" />
          </div>
          <div className="space-y-1">
            <p className="font-semibold text-foreground">No boards found</p>
            <p className="text-xs text-muted-foreground">
              Create your first board to get started with task management
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              window.location.href = `/${wsId}/tasks/boards`;
              setOpen(false);
            }}
            className="gap-2"
          >
            <Plus className="h-3 w-3" />
            Create Board
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-border/50 pb-2">
      {/* Collapsible Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            📋 Board Navigation
          </span>
          <div className="rounded-md bg-dynamic-blue/10 px-2 py-0.5 text-xs font-medium text-dynamic-blue">
            {boards.length} boards
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="h-6 w-6 p-0 hover:bg-muted/50"
          data-toggle
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </Button>
      </div>

      {/* Collapsible Content with Scrollable Area */}
      {isExpanded && (
        <div className="px-2">
          <ScrollArea className="max-h-[300px]">
            <CommandGroup>
              {boards.slice(0, 10).map((board: Board) => (
                <CommandItem
                  key={board.id}
                  onSelect={() => handleBoardSelect(board.id)}
                  className="command-item group cursor-pointer border-l-2 border-transparent transition-all duration-200 hover:border-dynamic-blue/30 hover:bg-gradient-to-r hover:from-dynamic-blue/5 hover:to-dynamic-purple/5"
                >
                  <div className="flex w-full items-center gap-4">
                    <div className="relative">
                      <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-dynamic-blue/20 to-dynamic-purple/20 blur-sm transition-all group-hover:blur-md" />
                      <div
                        className={`relative rounded-lg border border-dynamic-blue/20 p-2.5 ${getBoardColor(board.id)}`}
                      >
                        <LayoutDashboard className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground transition-colors group-hover:text-dynamic-blue">
                          {board.name}
                        </span>
                        <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Tag className="h-3 w-3" />
                          <span>{board.task_lists?.length || 0} lists</span>
                        </div>
                        <span>•</span>
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          <span>View tasks and manage board</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-dynamic-blue/60 opacity-0 transition-opacity group-hover:opacity-100">
                      Navigate
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </ScrollArea>

          {/* Additional Info Footer */}
          {boards.length > 10 && (
            <div className="border-t border-border/30 px-4 py-2 text-center">
              <p className="text-xs text-muted-foreground">
                Showing 10 of {boards.length} boards.
                <span className="font-medium text-foreground">
                  {' '}
                  Visit boards page to see all.
                </span>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
