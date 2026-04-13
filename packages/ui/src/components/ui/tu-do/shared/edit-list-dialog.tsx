'use client';

import {
  Circle,
  CircleCheck,
  CircleDashed,
  CircleX,
  FileText,
} from '@tuturuuu/icons';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { TaskBoardStatus } from '@tuturuuu/types/primitives/TaskBoard';
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
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

type EditableList = {
  id: string;
  name: string;
  status?: TaskBoardStatus | null;
  color?: SupportedColor | null;
};

interface EditListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  list: EditableList | null;
  allowedStatuses?: TaskBoardStatus[];
  isSaving?: boolean;
  onSave: (payload: {
    listId: string;
    updates: {
      name: string;
      status: TaskBoardStatus;
      color: SupportedColor;
    };
  }) => void;
}

const statusConfig = {
  not_started: {
    icon: CircleDashed,
    color: 'text-dynamic-gray',
  },
  active: {
    icon: Circle,
    color: 'text-dynamic-blue',
  },
  done: {
    icon: CircleCheck,
    color: 'text-dynamic-green',
  },
  closed: {
    icon: CircleX,
    color: 'text-dynamic-purple',
  },
  documents: {
    icon: FileText,
    color: 'text-dynamic-cyan',
  },
};

const statuses: TaskBoardStatus[] = [
  'documents',
  'not_started',
  'active',
  'done',
  'closed',
];

export function EditListDialog({
  open,
  onOpenChange,
  list,
  allowedStatuses,
  isSaving = false,
  onSave,
}: EditListDialogProps) {
  const t = useTranslations('common');

  if (!open || !list) {
    return null;
  }

  return (
    <EditListDialogForm
      key={list.id}
      list={list}
      allowedStatuses={allowedStatuses}
      isSaving={isSaving}
      onOpenChange={onOpenChange}
      onSave={onSave}
      labels={{
        active: t('active'),
        backlog: t('backlog'),
        blue: t('blue'),
        cancel: t('cancel'),
        closed: t('closed'),
        color: t('color'),
        cyan: t('cyan'),
        documents: t('documents'),
        done: t('done'),
        editList: t('edit_list'),
        gray: t('gray'),
        green: t('green'),
        indigo: t('indigo'),
        listName: t('list_name'),
        orange: t('orange'),
        pink: t('pink'),
        purple: t('purple'),
        red: t('red'),
        saveChanges: t('save_changes'),
        saving: t('saving'),
        statusCategory: t('status_category'),
        updateListDescription: t('change_list_name'),
        yellow: t('yellow'),
      }}
    />
  );
}

function EditListDialogForm({
  list,
  allowedStatuses,
  onOpenChange,
  isSaving,
  onSave,
  labels,
}: {
  list: EditableList;
  allowedStatuses?: TaskBoardStatus[];
  onOpenChange: (open: boolean) => void;
  isSaving: boolean;
  onSave: EditListDialogProps['onSave'];
  labels: {
    active: string;
    backlog: string;
    blue: string;
    cancel: string;
    closed: string;
    color: string;
    cyan: string;
    documents: string;
    done: string;
    editList: string;
    gray: string;
    green: string;
    indigo: string;
    listName: string;
    orange: string;
    pink: string;
    purple: string;
    red: string;
    saveChanges: string;
    saving: string;
    statusCategory: string;
    updateListDescription: string;
    yellow: string;
  };
}) {
  const resolvedAllowedStatuses = useMemo(() => {
    if (allowedStatuses && allowedStatuses.length > 0) {
      return allowedStatuses;
    }

    if (list.status === 'closed') {
      return statuses;
    }

    return statuses.filter((itemStatus) => itemStatus !== 'closed');
  }, [allowedStatuses, list.status]);

  const defaultStatus = useMemo<TaskBoardStatus>(() => {
    if (list.status && resolvedAllowedStatuses.includes(list.status)) {
      return list.status;
    }

    return resolvedAllowedStatuses.find(() => true) ?? 'active';
  }, [list.status, resolvedAllowedStatuses]);

  const [name, setName] = useState(list.name ?? '');
  const [status, setStatus] = useState<TaskBoardStatus>(defaultStatus);
  const [color, setColor] = useState<SupportedColor>(list.color ?? 'GRAY');
  const selectedStatus = resolvedAllowedStatuses.includes(status)
    ? status
    : defaultStatus;

  const statusLabels: Record<TaskBoardStatus, string> = {
    not_started: labels.backlog,
    active: labels.active,
    done: labels.done,
    closed: labels.closed,
    documents: labels.documents,
  };

  const colorOptions = [
    {
      value: 'GRAY' as SupportedColor,
      label: labels.gray,
      class: 'bg-dynamic-gray/30',
    },
    {
      value: 'RED' as SupportedColor,
      label: labels.red,
      class: 'bg-dynamic-red/30',
    },
    {
      value: 'BLUE' as SupportedColor,
      label: labels.blue,
      class: 'bg-dynamic-blue/30',
    },
    {
      value: 'GREEN' as SupportedColor,
      label: labels.green,
      class: 'bg-dynamic-green/30',
    },
    {
      value: 'YELLOW' as SupportedColor,
      label: labels.yellow,
      class: 'bg-dynamic-yellow/30',
    },
    {
      value: 'ORANGE' as SupportedColor,
      label: labels.orange,
      class: 'bg-dynamic-orange/30',
    },
    {
      value: 'PURPLE' as SupportedColor,
      label: labels.purple,
      class: 'bg-dynamic-purple/30',
    },
    {
      value: 'PINK' as SupportedColor,
      label: labels.pink,
      class: 'bg-dynamic-pink/30',
    },
    {
      value: 'INDIGO' as SupportedColor,
      label: labels.indigo,
      class: 'bg-dynamic-indigo/30',
    },
    {
      value: 'CYAN' as SupportedColor,
      label: labels.cyan,
      class: 'bg-dynamic-cyan/30',
    },
  ];

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-106.25">
        <DialogHeader>
          <DialogTitle>{labels.editList}</DialogTitle>
          <DialogDescription>{labels.updateListDescription}</DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmedName = name.trim();
            if (!trimmedName) {
              return;
            }
            if (!resolvedAllowedStatuses.includes(selectedStatus)) {
              return;
            }
            onSave({
              listId: list.id,
              updates: {
                name: trimmedName,
                status: selectedStatus,
                color,
              },
            });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="edit-list-name">{labels.listName}</Label>
            <Input
              id="edit-list-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={labels.listName}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-list-status">{labels.statusCategory}</Label>
            <Select
              value={selectedStatus}
              onValueChange={(value) => {
                const nextStatus = value as TaskBoardStatus;
                if (!resolvedAllowedStatuses.includes(nextStatus)) {
                  return;
                }
                setStatus(nextStatus);
              }}
            >
              <SelectTrigger id="edit-list-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {resolvedAllowedStatuses.map((itemStatus) => {
                  const Icon = statusConfig[itemStatus].icon;
                  return (
                    <SelectItem key={itemStatus} value={itemStatus}>
                      <div className="flex items-center gap-2">
                        <Icon
                          className={cn(
                            'h-4 w-4',
                            statusConfig[itemStatus].color
                          )}
                        />
                        {statusLabels[itemStatus]}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{labels.color}</Label>
            <div className="grid grid-cols-5 gap-3">
              {colorOptions.map((colorOption) => (
                <button
                  type="button"
                  key={colorOption.value}
                  onClick={() => setColor(colorOption.value)}
                  className={cn(
                    'h-10 w-10 rounded-lg border-2 transition-all hover:scale-105',
                    colorOption.class,
                    color === colorOption.value &&
                      'scale-110 ring-1 ring-primary ring-offset-2 ring-offset-background'
                  )}
                  title={colorOption.label}
                />
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              {labels.cancel}
            </Button>
            <Button type="submit" disabled={isSaving || !name.trim()}>
              {isSaving ? labels.saving : labels.saveChanges}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
