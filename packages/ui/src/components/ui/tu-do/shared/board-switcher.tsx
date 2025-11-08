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

interface BoardSwitcherProps {
  board: Pick<WorkspaceTaskBoard, 'id' | 'name' | 'ws_id'>;
}

type BoardWithStatus = {
  id: string;
  name: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  created_at: string | null;
};

function getBoardStatus(board: BoardWithStatus) {
  if (board.deleted_at) {
    const deletedDate = new Date(board.deleted_at);
    const now = new Date();
    const daysPassed = Math.floor(
      (now.getTime() - deletedDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const daysRemaining = Math.max(0, 30 - daysPassed);
    return {
      type: 'deleted' as const,
      label: 'Deleted',
      daysRemaining,
      variant: 'destructive' as const,
      icon: Trash2,
    };
  }

  if (board.archived_at) {
    return {
      type: 'archived' as const,
      label: 'Archived',
      variant: 'secondary' as const,
      icon: Archive,
    };
  }

  return {
    type: 'active' as const,
    label: 'Active',
    variant: 'default' as const,
    icon: CheckCircle2,
  };
}

export function BoardSwitcher({ board }: BoardSwitcherProps) {
  const router = useRouter();

  const { data: boards = [], isLoading: isFetchingBoards } = useQuery({
    queryKey: ['other-boards', board.ws_id, board.id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('workspace_boards')
        .select('id, name, archived_at, deleted_at, created_at')
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="group flex cursor-pointer items-center gap-2 transition-colors hover:text-foreground">
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
                  const status = getBoardStatus(otherBoard);
                  const StatusIcon = status.icon;

                  return (
                    <DropdownMenuItem
                      key={otherBoard.id}
                      onClick={() =>
                        router.push(
                          `/${board.ws_id}/tasks/boards/${otherBoard.id}`
                        )
                      }
                      className="group/item cursor-pointer gap-3 py-2.5"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors group-hover/item:bg-primary/20">
                        <LayoutGrid className="h-4 w-4" />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="truncate font-medium text-sm leading-none">
                          {otherBoard.name || 'Untitled'}
                        </span>
                      </div>
                      <Badge
                        variant={status.variant}
                        className={cn(
                          'shrink-0 gap-1 px-2 py-0.5 text-[10px]',
                          status.type === 'active' &&
                            'bg-dynamic-green/10 text-dynamic-green hover:bg-dynamic-green/20'
                        )}
                      >
                        <StatusIcon className="h-3 w-3" />
                        {status.label}
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
                  const status = getBoardStatus(otherBoard);
                  const StatusIcon = status.icon;

                  return (
                    <DropdownMenuItem
                      key={otherBoard.id}
                      onClick={() =>
                        router.push(
                          `/${board.ws_id}/tasks/boards/${otherBoard.id}`
                        )
                      }
                      className="group/item cursor-pointer gap-3 py-2.5 opacity-75 hover:opacity-100"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <LayoutGrid className="h-4 w-4" />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="truncate font-medium text-sm leading-none">
                          {otherBoard.name || 'Untitled'}
                        </span>
                      </div>
                      <Badge
                        variant={status.variant}
                        className="shrink-0 gap-1 px-2 py-0.5 text-[10px]"
                      >
                        <StatusIcon className="h-3 w-3" />
                        {status.label}
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
                  const status = getBoardStatus(otherBoard);
                  const StatusIcon = status.icon;

                  return (
                    <DropdownMenuItem
                      key={otherBoard.id}
                      onClick={() =>
                        router.push(
                          `/${board.ws_id}/tasks/boards/${otherBoard.id}`
                        )
                      }
                      className="group/item cursor-pointer gap-3 py-2.5 opacity-60 hover:opacity-100"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                        <LayoutGrid className="h-4 w-4" />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="truncate font-medium text-sm leading-none">
                          {otherBoard.name || 'Untitled'}
                        </span>
                        {status.type === 'deleted' && (
                          <span className="text-[10px] text-muted-foreground leading-none">
                            {status.daysRemaining} days left
                          </span>
                        )}
                      </div>
                      <Badge
                        variant={status.variant}
                        className="shrink-0 gap-1 px-2 py-0.5 text-[10px]"
                      >
                        <StatusIcon className="h-3 w-3" />
                        {status.label}
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
