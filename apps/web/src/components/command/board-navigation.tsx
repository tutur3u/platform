'use client';

import { CommandGroup, CommandItem } from '@tuturuuu/ui/command';
import { ExternalLink, LayoutDashboard, MapPin, Tag } from '@tuturuuu/ui/icons';
import * as React from 'react';
import type { Board } from './types';

interface BoardNavigationProps {
  boards: Board[];
  inputValue: string;
  onBoardSelect: (boardId: string) => void;
}

export function BoardNavigation({
  boards,
  inputValue,
  onBoardSelect,
}: BoardNavigationProps) {
  const getBoardColor = (boardId: string) => {
    const colors = [
      'bg-dynamic-blue/10 text-dynamic-blue',
      'bg-dynamic-green/10 text-dynamic-green',
      'bg-dynamic-purple/10 text-dynamic-purple',
      'bg-dynamic-orange/10 text-dynamic-orange',
      'bg-dynamic-pink/10 text-dynamic-pink',
    ];
    const hash = boardId.split('').reduce((a, b) => {
      a = (a << 5) - a + b.charCodeAt(0);
      return a & a;
    }, 0);
    return colors[Math.abs(hash) % colors.length];
  };

  // Filter boards based on input value
  const filteredBoards = React.useMemo(() => {
    if (!inputValue) return boards.slice(0, 5); // Show first 5 by default
    return boards
      .filter((board: Board) =>
        board.name.toLowerCase().includes(inputValue.toLowerCase())
      )
      .slice(0, 8); // Show up to 8 filtered results
  }, [boards, inputValue]);

  if (filteredBoards.length === 0) return null;

  return (
    <CommandGroup heading="📋 Quick Board Navigation">
      {filteredBoards.map((board: Board) => (
        <CommandItem
          key={board.id}
          onSelect={() => onBoardSelect(board.id)}
          className="group cursor-pointer border-l-2 border-transparent transition-all duration-200 hover:border-dynamic-blue/30 hover:bg-gradient-to-r hover:from-dynamic-blue/5 hover:to-dynamic-purple/5"
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
      {boards.length > 5 && !inputValue && (
        <div className="px-4 py-2 text-center">
          <p className="text-xs text-muted-foreground">
            Type to search {boards.length - 5} more boards...
          </p>
        </div>
      )}
    </CommandGroup>
  );
}
