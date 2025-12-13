import { useQuery } from '@tanstack/react-query';
import {
  Archive,
  CheckCircle2,
  ChevronsUpDown,
  LayoutGrid,
  Loader2,
  Trash2,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { cn } from '@tuturuuu/utils/format';
import { useRouter } from 'next/navigation';
import {
  getIconComponentByKey,
  type WorkspaceBoardIconKey,
} from '../../custom/icon-picker';

interface BoardSwitcherProps {
  board: Pick<WorkspaceTaskBoard, 'id' | 'name' | 'ws_id' | 'ticket_prefix'> & {
    icon?: WorkspaceTaskBoard['icon'];
  };
}

type BoardWithStatus = {
  id: string;
  name: string | null;
  icon: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  created_at: string | null;
};

function getDaysRemaining(deletedAt: string) {
  const deletedDate = new Date(deletedAt);
  const now = new Date();
  const daysPassed = Math.floor(
    (now.getTime() - deletedDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  return Math.max(0, 30 - daysPassed);
}

export function BoardSwitcher({ board }: BoardSwitcherProps) {
  const router = useRouter();

  const { data: boards = [], isLoading: isFetchingBoards } = useQuery({
    queryKey: ['other-boards', board.ws_id, board.id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('workspace_boards')
        .select('id, name, icon, archived_at, deleted_at, created_at')
        .eq('ws_id', board.ws_id)
        .order('name');

      if (error) {
        console.error('Failed to fetch other boards:', error);
        throw error;
      }
      return (data || []) as BoardWithStatus[];
    },
    enabled: !!board.ws_id,
  });

  // Separate boards by status
  const activeBoards = boards.filter((b) => !b.archived_at && !b.deleted_at);
  const archivedBoards = boards.filter((b) => b.archived_at && !b.deleted_at);
  const deletedBoards = boards.filter((b) => b.deleted_at);

  // Get current board's icon
  const CurrentBoardIcon =
    getIconComponentByKey(board.icon as WorkspaceBoardIconKey | null) ??
    LayoutGrid;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="group flex cursor-pointer items-center gap-2 transition-colors hover:text-foreground">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
            <CurrentBoardIcon className="h-4 w-4" />
          </div>
          <h1 className="truncate font-bold text-base text-foreground sm:text-xl md:text-2xl">
            {board.name}
          </h1>
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground transition-transform group-hover:scale-110" />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[320px]">
        {isFetchingBoards ? (
          <DropdownMenuItem disabled>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading boards...
          </DropdownMenuItem>
        ) : boards.length === 0 ? (
          <DropdownMenuItem disabled className="justify-center">
            No other boards
          </DropdownMenuItem>
        ) : (
          <>
            {/* Active Boards */}
            {activeBoards.length > 0 && (
              <>
                <DropdownMenuLabel className="text-muted-foreground text-xs">
                  Active Boards
                </DropdownMenuLabel>
                {activeBoards.map((otherBoard) => {
                  const isCurrentBoard = otherBoard.id === board.id;
                  const BoardIcon =
                    getIconComponentByKey(
                      otherBoard.icon as WorkspaceBoardIconKey | null
                    ) ?? LayoutGrid;
                  return (
                    <DropdownMenuItem
                      key={otherBoard.id}
                      onClick={() =>
                        router.push(
                          `/${board.ws_id}/tasks/boards/${otherBoard.id}`
                        )
                      }
                      className={cn(
                        'group/item cursor-pointer gap-3 py-2.5',
                        isCurrentBoard && 'bg-dynamic-blue/10 text-dynamic-blue'
                      )}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors group-hover/item:bg-primary/20">
                        <BoardIcon className="h-4 w-4" />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="truncate font-medium text-sm leading-none">
                          {otherBoard.name || 'Untitled'}
                        </span>
                      </div>
                      <Badge
                        className={cn(
                          'shrink-0 gap-1 px-2 py-0.5 text-[10px]',
                          'bg-dynamic-green/10 text-dynamic-green'
                        )}
                      >
                        <CheckCircle2 className="h-3 w-3 text-dynamic-green/50" />
                        Active
                      </Badge>
                    </DropdownMenuItem>
                  );
                })}
              </>
            )}

            {/* Archived Boards */}
            {archivedBoards.length > 0 && (
              <>
                {activeBoards.length > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="text-muted-foreground text-xs">
                  Archived Boards
                </DropdownMenuLabel>
                {archivedBoards.map((otherBoard) => {
                  const isCurrentBoard = otherBoard.id === board.id;
                  const BoardIcon =
                    getIconComponentByKey(
                      otherBoard.icon as WorkspaceBoardIconKey | null
                    ) ?? LayoutGrid;
                  return (
                    <DropdownMenuItem
                      key={otherBoard.id}
                      onClick={() =>
                        router.push(
                          `/${board.ws_id}/tasks/boards/${otherBoard.id}`
                        )
                      }
                      className={cn(
                        'group/item cursor-pointer gap-3 py-2.5 opacity-75 hover:opacity-100',
                        isCurrentBoard &&
                          'bg-dynamic-blue/10 text-dynamic-blue opacity-100'
                      )}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <BoardIcon className="h-4 w-4" />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="truncate font-medium text-sm leading-none">
                          {otherBoard.name || 'Untitled'}
                        </span>
                      </div>
                      <Badge
                        className={cn(
                          'shrink-0 gap-1 px-2 py-0.5 text-[10px]',
                          'bg-muted text-foreground'
                        )}
                      >
                        <Archive className="h-3 w-3 text-foreground/50" />
                        Archived
                      </Badge>
                    </DropdownMenuItem>
                  );
                })}
              </>
            )}

            {/* Deleted Boards */}
            {deletedBoards.length > 0 && (
              <>
                {(activeBoards.length > 0 || archivedBoards.length > 0) && (
                  <DropdownMenuSeparator />
                )}
                <DropdownMenuLabel className="text-muted-foreground text-xs">
                  Deleted Boards
                </DropdownMenuLabel>
                {deletedBoards.map((otherBoard) => {
                  const daysRemaining = getDaysRemaining(
                    otherBoard.deleted_at ?? ''
                  );
                  const isCurrentBoard = otherBoard.id === board.id;
                  const BoardIcon =
                    getIconComponentByKey(
                      otherBoard.icon as WorkspaceBoardIconKey | null
                    ) ?? LayoutGrid;

                  return (
                    <DropdownMenuItem
                      key={otherBoard.id}
                      onClick={() =>
                        router.push(
                          `/${board.ws_id}/tasks/boards/${otherBoard.id}`
                        )
                      }
                      className={cn(
                        'group/item cursor-pointer gap-3 py-2.5 opacity-60 hover:opacity-100',
                        isCurrentBoard &&
                          'bg-dynamic-blue/10 text-dynamic-blue opacity-100'
                      )}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                        <BoardIcon className="h-4 w-4" />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="truncate font-medium text-sm leading-none">
                          {otherBoard.name || 'Untitled'}
                        </span>
                        <span className="text-[10px] text-muted-foreground leading-none">
                          {daysRemaining} days left
                        </span>
                      </div>
                      <Badge
                        className={cn(
                          'shrink-0 gap-1 px-2 py-0.5 text-[10px]',
                          'bg-dynamic-red/10 text-dynamic-red'
                        )}
                      >
                        <Trash2 className="h-3 w-3 text-dynamic-red/50" />
                        Deleted
                      </Badge>
                    </DropdownMenuItem>
                  );
                })}
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
