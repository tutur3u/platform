import { createClient } from '@tutur3u/supabase/next/client';
import { Button } from '@tutur3u/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tutur3u/ui/dropdown-menu';
import { cn } from '@tutur3u/ui/lib/utils';
import { Separator } from '@tutur3u/ui/separator';
import {
  CalendarDays,
  LayoutGrid,
  List,
  MoreHorizontal,
  Pencil,
  Settings,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Props {
  boardId: string;
  boardName: string;
  viewType: 'kanban' | 'list' | 'calendar';
  // eslint-disable-next-line no-unused-vars
  onViewChange: (view: 'kanban' | 'list' | 'calendar') => void;
}

export function BoardHeader({
  boardId,
  boardName,
  viewType,
  onViewChange,
}: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    try {
      setIsLoading(true);
      const supabase = createClient();
      await supabase.from('workspace_boards').delete().eq('id', boardId);
      router.push('../');
    } catch (error) {
      console.error('Failed to delete board:', error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 border-b px-4 py-2">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">{boardName}</h1>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={isLoading}
        >
          <Pencil className="h-4 w-4" />
          <span className="sr-only">Edit board name</span>
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-lg border bg-background p-1">
          <Button
            variant="ghost"
            size="sm"
            className={cn('gap-2', viewType === 'kanban' && 'bg-secondary')}
            onClick={() => onViewChange('kanban')}
          >
            <LayoutGrid className="h-4 w-4" />
            Board
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn('gap-2', viewType === 'list' && 'bg-secondary')}
            onClick={() => onViewChange('list')}
          >
            <List className="h-4 w-4" />
            List
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn('gap-2', viewType === 'calendar' && 'bg-secondary')}
            onClick={() => onViewChange('calendar')}
          >
            <CalendarDays className="h-4 w-4" />
            Calendar
          </Button>
        </div>

        <Separator orientation="vertical" className="h-8" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Open board menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[180px]">
            <DropdownMenuItem className="gap-2">
              <Settings className="h-4 w-4" />
              Board settings
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleDelete}
              className="gap-2 text-red-600 focus:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
              Delete board
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
