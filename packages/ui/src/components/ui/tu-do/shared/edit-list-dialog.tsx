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
import { useEffect, useState } from 'react';

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
  isSaving = false,
  onSave,
}: EditListDialogProps) {
  const t = useTranslations('common');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<TaskBoardStatus>('active');
  const [color, setColor] = useState<SupportedColor>('GRAY');

  useEffect(() => {
    if (!list || !open) {
      return;
    }

    setName(list.name ?? '');
    setStatus(list.status ?? 'active');
    setColor(list.color ?? 'GRAY');
  }, [list, open]);

  const statusLabels: Record<TaskBoardStatus, string> = {
    not_started: t('backlog'),
    active: t('active'),
    done: t('done'),
    closed: t('closed'),
    documents: t('documents'),
  };

  const colorOptions = [
    {
      value: 'GRAY' as SupportedColor,
      label: t('gray'),
      class: 'bg-dynamic-gray/30',
    },
    {
      value: 'RED' as SupportedColor,
      label: t('red'),
      class: 'bg-dynamic-red/30',
    },
    {
      value: 'BLUE' as SupportedColor,
      label: t('blue'),
      class: 'bg-dynamic-blue/30',
    },
    {
      value: 'GREEN' as SupportedColor,
      label: t('green'),
      class: 'bg-dynamic-green/30',
    },
    {
      value: 'YELLOW' as SupportedColor,
      label: t('yellow'),
      class: 'bg-dynamic-yellow/30',
    },
    {
      value: 'ORANGE' as SupportedColor,
      label: t('orange'),
      class: 'bg-dynamic-orange/30',
    },
    {
      value: 'PURPLE' as SupportedColor,
      label: t('purple'),
      class: 'bg-dynamic-purple/30',
    },
    {
      value: 'PINK' as SupportedColor,
      label: t('pink'),
      class: 'bg-dynamic-pink/30',
    },
    {
      value: 'INDIGO' as SupportedColor,
      label: t('indigo'),
      class: 'bg-dynamic-indigo/30',
    },
    {
      value: 'CYAN' as SupportedColor,
      label: t('cyan'),
      class: 'bg-dynamic-cyan/30',
    },
  ];

  if (!list) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-106.25">
        <DialogHeader>
          <DialogTitle>{t('edit_list')}</DialogTitle>
          <DialogDescription>{t('change_list_name')}</DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmedName = name.trim();
            if (!trimmedName) {
              return;
            }
            onSave({
              listId: list.id,
              updates: {
                name: trimmedName,
                status,
                color,
              },
            });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="edit-list-name">{t('list_name')}</Label>
            <Input
              id="edit-list-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('list_name')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-list-status">{t('status_category')}</Label>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as TaskBoardStatus)}
            >
              <SelectTrigger id="edit-list-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((itemStatus) => {
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
            <Label>{t('color')}</Label>
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
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={isSaving || !name.trim()}>
              {isSaving ? t('saving') : t('save_changes')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
