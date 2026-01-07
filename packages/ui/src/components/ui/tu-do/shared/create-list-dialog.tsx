'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Circle,
  CircleCheck,
  CircleDashed,
  CircleX,
  FileText,
  Loader2,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { TaskBoardStatus } from '@tuturuuu/types/primitives/TaskBoard';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { useEffect, useState } from 'react';

interface CreateListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardId: string;
  wsId?: string;
  initialName?: string;
  onSuccess?: (listId: string) => void;
  translations?: {
    createNewList?: string;
    addListDescription?: string;
    listName?: string;
    listNamePlaceholder?: string;
    statusCategory?: string;
    color?: string;
    cancel?: string;
    creating?: string;
    createList?: string;
    listCreatedSuccessfully?: string;
    failedToCreateList?: string;
    // Status labels
    backlog?: string;
    active?: string;
    doneStatus?: string;
    closed?: string;
    documents?: string;
  };
}

const statusConfig = {
  not_started: {
    icon: CircleDashed,
    label: 'Backlog',
    color: 'text-dynamic-gray',
  },
  active: {
    icon: Circle,
    label: 'Active',
    color: 'text-dynamic-blue',
  },
  done: {
    icon: CircleCheck,
    label: 'Done',
    color: 'text-dynamic-green',
  },
  closed: {
    icon: CircleX,
    label: 'Closed',
    color: 'text-dynamic-purple',
  },
  documents: {
    icon: FileText,
    label: 'Documents',
    color: 'text-dynamic-cyan',
  },
};

const colorOptions: { value: SupportedColor; label: string; class: string }[] =
  [
    { value: 'GRAY', label: 'Gray', class: 'bg-dynamic-gray/30' },
    { value: 'RED', label: 'Red', class: 'bg-dynamic-red/30' },
    { value: 'BLUE', label: 'Blue', class: 'bg-dynamic-blue/30' },
    { value: 'GREEN', label: 'Green', class: 'bg-dynamic-green/30' },
    { value: 'YELLOW', label: 'Yellow', class: 'bg-dynamic-yellow/30' },
    { value: 'ORANGE', label: 'Orange', class: 'bg-dynamic-orange/30' },
    { value: 'PURPLE', label: 'Purple', class: 'bg-dynamic-purple/30' },
    { value: 'PINK', label: 'Pink', class: 'bg-dynamic-pink/30' },
    { value: 'INDIGO', label: 'Indigo', class: 'bg-dynamic-indigo/30' },
    { value: 'CYAN', label: 'Cyan', class: 'bg-dynamic-cyan/30' },
  ];

const statuses: TaskBoardStatus[] = [
  'documents',
  'not_started',
  'active',
  'done',
  'closed',
];

export function CreateListDialog({
  open,
  onOpenChange,
  boardId,
  wsId,
  initialName = '',
  onSuccess,
  translations,
}: CreateListDialogProps) {
  const t = {
    createNewList: translations?.createNewList ?? 'Create New List',
    addListDescription:
      translations?.addListDescription ??
      'Add a new list to organize your tasks.',
    listName: translations?.listName ?? 'List Name',
    listNamePlaceholder:
      translations?.listNamePlaceholder ??
      'e.g., In Review, Testing, Ready for Deploy',
    statusCategory: translations?.statusCategory ?? 'Status Category',
    color: translations?.color ?? 'Color',
    cancel: translations?.cancel ?? 'Cancel',
    creating: translations?.creating ?? 'Creating...',
    createList: translations?.createList ?? 'Create List',
    listCreatedSuccessfully:
      translations?.listCreatedSuccessfully ?? 'List created successfully',
    failedToCreateList:
      translations?.failedToCreateList ?? 'Failed to create list',
    // Status labels
    backlog: translations?.backlog ?? 'Backlog',
    active: translations?.active ?? 'Active',
    doneStatus: translations?.doneStatus ?? 'Done',
    closed: translations?.closed ?? 'Closed',
    documents: translations?.documents ?? 'Documents',
  };

  const statusLabels: Record<TaskBoardStatus, string> = {
    not_started: t.backlog,
    active: t.active,
    done: t.doneStatus,
    closed: t.closed,
    documents: t.documents,
  };
  const queryClient = useQueryClient();
  const supabase = createClient();

  const [newListName, setNewListName] = useState('');
  const [newListStatus, setNewListStatus] = useState<TaskBoardStatus>('active');
  const [newListColor, setNewListColor] = useState<SupportedColor>('BLUE');

  // Sync initialName when dialog opens
  useEffect(() => {
    if (open && initialName) {
      setNewListName(initialName);
    }
  }, [open, initialName]);

  const resetForm = () => {
    setNewListName('');
    setNewListStatus('active');
    setNewListColor('BLUE');
  };

  const createListMutation = useMutation({
    mutationFn: async ({
      name,
      status,
      color,
    }: {
      name: string;
      status: TaskBoardStatus;
      color: SupportedColor;
    }) => {
      // Get max position for this status
      const { data: existingLists } = await supabase
        .from('task_lists')
        .select('position, status')
        .eq('board_id', boardId)
        .eq('status', status);

      const maxPosition = Math.max(
        0,
        ...(existingLists || []).map((l) => l.position || 0)
      );

      const { data, error } = await supabase
        .from('task_lists')
        .insert({
          name,
          status,
          color,
          board_id: boardId,
          position: maxPosition + 1,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      toast.success(t.listCreatedSuccessfully);

      // Use setQueryData for immediate UI update without flicker
      // Realtime subscription handles cross-user sync
      queryClient.setQueryData(
        ['task_lists', boardId],
        (old: TaskList[] | undefined) => {
          if (!old) return [data as TaskList];
          // Check if already exists (from realtime)
          if (old.some((l) => l.id === data.id)) return old;
          return [...old, data as TaskList];
        }
      );

      // Invalidate sidebar board lists (acceptable - not causing main view flicker)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['boards-with-lists'] }),
        wsId
          ? queryClient.invalidateQueries({
              queryKey: ['workspace', wsId, 'boards-with-lists'],
            })
          : Promise.resolve(),
      ]);

      // Then call onSuccess callback which will select the list
      onSuccess?.(data.id);

      // Finally close dialog and reset form
      onOpenChange(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || t.failedToCreateList);
    },
  });

  const handleCreateList = () => {
    if (!newListName.trim()) return;
    createListMutation.mutate({
      name: newListName.trim(),
      status: newListStatus,
      color: newListColor,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) resetForm();
      }}
    >
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t.createNewList}</DialogTitle>
          <DialogDescription>{t.addListDescription}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="new-list-name">{t.listName}</Label>
            <Input
              id="new-list-name"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder={t.listNamePlaceholder}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newListName.trim()) {
                  e.preventDefault();
                  handleCreateList();
                }
              }}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-list-status">{t.statusCategory}</Label>
            <Select
              value={newListStatus}
              onValueChange={(value) =>
                setNewListStatus(value as TaskBoardStatus)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((status) => {
                  const Icon = statusConfig[status].icon;
                  return (
                    <SelectItem key={status} value={status}>
                      <div className="flex items-center gap-2">
                        <Icon
                          className={cn('h-4 w-4', statusConfig[status].color)}
                        />
                        {statusLabels[status]}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t.color}</Label>
            <div className="grid grid-cols-5 gap-2">
              {colorOptions.map((color) => (
                <button
                  type="button"
                  key={color.value}
                  onClick={() => setNewListColor(color.value)}
                  className={cn(
                    'h-8 w-8 rounded border-2 transition-all',
                    color.class,
                    newListColor === color.value &&
                      'scale-110 ring-2 ring-primary'
                  )}
                  title={color.label}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              resetForm();
            }}
            disabled={createListMutation.isPending}
          >
            {t.cancel}
          </Button>
          <Button
            onClick={handleCreateList}
            disabled={!newListName.trim() || createListMutation.isPending}
          >
            {createListMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t.creating}
              </>
            ) : (
              t.createList
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
