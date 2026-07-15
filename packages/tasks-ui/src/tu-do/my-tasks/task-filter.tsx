'use client';

import { ChevronDown, ChevronUp, Filter, Plus } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface Item {
  id: string;
  name: string;
}

interface BoardItem {
  id: string;
  name: string;
  ws_id: string;
}

interface TaskFilterProps {
  workspaces: Item[];
  boards: BoardItem[];
  onFilterChange: (filters: {
    workspaceIds: string[];
    boardIds: string[];
  }) => void;
  onCreateNewBoard: () => void;
}

export function TaskFilter({
  workspaces,
  boards,
  onFilterChange,
  onCreateNewBoard,
}: TaskFilterProps) {
  const t = useTranslations('ws-tasks');
  const [selectedWorkspaceIds, setSelectedWorkspaceIds] = useState<string[]>([
    'all',
  ]);
  const [selectedBoardIds, setSelectedBoardIds] = useState<string[]>(['all']);
  const [workspacesOpen, setWorkspacesOpen] = useState(true);
  const [boardsOpen, setBoardsOpen] = useState(true);

  const filteredBoards = selectedWorkspaceIds.includes('all')
    ? boards
    : boards.filter((board) => selectedWorkspaceIds.includes(board.ws_id));

  const handleWorkspaceChange = (id: string) => {
    setSelectedBoardIds(['all']);
    if (id === 'all') {
      setSelectedWorkspaceIds(['all']);
    } else {
      const newIds = selectedWorkspaceIds.filter((wsId) => wsId !== 'all');
      if (newIds.includes(id)) {
        const filtered = newIds.filter((wsId) => wsId !== id);
        if (filtered.length === 0) {
          setSelectedWorkspaceIds(['all']);
        } else {
          setSelectedWorkspaceIds(filtered);
        }
      } else {
        setSelectedWorkspaceIds([...newIds, id]);
      }
    }
  };

  const handleBoardChange = (id: string) => {
    if (id === 'all') {
      setSelectedBoardIds(['all']);
    } else {
      const newIds = selectedBoardIds.filter((bId) => bId !== 'all');
      if (newIds.includes(id)) {
        const filtered = newIds.filter((bId) => bId !== id);
        if (filtered.length === 0) {
          setSelectedBoardIds(['all']);
        } else {
          setSelectedBoardIds(filtered);
        }
      } else {
        setSelectedBoardIds([...newIds, id]);
      }
    }
  };

  useEffect(() => {
    onFilterChange({
      workspaceIds: selectedWorkspaceIds,
      boardIds: selectedBoardIds,
    });
  }, [selectedWorkspaceIds, selectedBoardIds, onFilterChange]);

  const isFiltered =
    !selectedWorkspaceIds.includes('all') || !selectedBoardIds.includes('all');

  return (
    <div className="group/chip flex items-center gap-2">
      <DropdownMenu>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={isFiltered ? 'secondary' : 'ghost'}
                  className={cn(
                    'flex items-center gap-x-1.5 px-2.5 py-1 font-medium text-sm'
                  )}
                >
                  <Filter className="h-3.5 w-3.5" />
                  <span>{t('filter_workspaces')}</span>
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t('filter_by_workspaces')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <DropdownMenuContent className="w-64" align="start">
          <DropdownMenuGroup>
            <Collapsible open={workspacesOpen} onOpenChange={setWorkspacesOpen}>
              <CollapsibleTrigger className="flex w-full items-center justify-between px-2 py-1.5 font-semibold text-sm">
                <DropdownMenuLabel>{t('filter_workspaces')}</DropdownMenuLabel>
                {workspacesOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <DropdownMenuItem
                  onSelect={(e) => e.preventDefault()}
                  onClick={() => handleWorkspaceChange('all')}
                >
                  <Checkbox
                    checked={selectedWorkspaceIds.includes('all')}
                    className="mr-2"
                  />
                  {t('filter_all_workspaces')}
                </DropdownMenuItem>
                {workspaces.map((ws) => (
                  <DropdownMenuItem
                    key={ws.id}
                    onSelect={(e) => e.preventDefault()}
                    onClick={() => handleWorkspaceChange(ws.id)}
                  >
                    <Checkbox
                      checked={selectedWorkspaceIds.includes(ws.id)}
                      className="mr-2"
                    />
                    {ws.name}
                  </DropdownMenuItem>
                ))}
              </CollapsibleContent>
            </Collapsible>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <Collapsible open={boardsOpen} onOpenChange={setBoardsOpen}>
              <CollapsibleTrigger className="flex w-full items-center justify-between px-2 py-1.5 font-semibold text-sm">
                <DropdownMenuLabel>{t('filter_boards')}</DropdownMenuLabel>
                {boardsOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
              </CollapsibleTrigger>
              <CollapsibleContent>
                {filteredBoards.length > 0 ? (
                  <ScrollArea className="max-h-45">
                    <DropdownMenuItem
                      onSelect={(e) => e.preventDefault()}
                      onClick={() => handleBoardChange('all')}
                    >
                      <Checkbox
                        checked={selectedBoardIds.includes('all')}
                        className="mr-2"
                      />
                      {t('filter_all_boards')}
                    </DropdownMenuItem>
                    {filteredBoards.map((board) => (
                      <DropdownMenuItem
                        key={board.id}
                        onSelect={(e) => e.preventDefault()}
                        onClick={() => handleBoardChange(board.id)}
                      >
                        <Checkbox
                          checked={selectedBoardIds.includes(board.id)}
                          className="mr-2"
                        />
                        {board.name}
                      </DropdownMenuItem>
                    ))}
                  </ScrollArea>
                ) : (
                  <div className="px-2 py-1.5 text-center text-muted-foreground text-sm">
                    {t('filter_no_boards_for_workspaces')}
                  </div>
                )}
                <DropdownMenuItem
                  onSelect={() => onCreateNewBoard()}
                  className="mt-1"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  <span>{t('filter_add_new_board')}</span>
                </DropdownMenuItem>
              </CollapsibleContent>
            </Collapsible>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
