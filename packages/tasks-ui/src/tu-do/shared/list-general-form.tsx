'use client';

import {
  Circle,
  CircleCheck,
  CircleDashed,
  CircleX,
  ClipboardCheck,
  FileText,
} from '@tuturuuu/icons';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { TaskBoardStatus } from '@tuturuuu/types/primitives/TaskBoard';
import { Button } from '@tuturuuu/ui/button';
import { DialogFooter } from '@tuturuuu/ui/dialog';
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

export type EditableList = {
  id: string;
  name: string;
  status?: TaskBoardStatus | null;
  color?: SupportedColor | null;
};

export type ListGeneralSavePayload = {
  listId: string;
  updates: {
    name: string;
    status: TaskBoardStatus;
    color: SupportedColor;
  };
};

const statusConfig = {
  not_started: {
    icon: CircleDashed,
    color: 'text-dynamic-gray',
  },
  active: {
    icon: Circle,
    color: 'text-dynamic-blue',
  },
  review: {
    icon: ClipboardCheck,
    color: 'text-dynamic-orange',
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

export const statuses: TaskBoardStatus[] = [
  'documents',
  'not_started',
  'active',
  'review',
  'done',
  'closed',
];

export type ListGeneralLabels = {
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
  review: string;
  saveChanges: string;
  saving: string;
  statusCategory: string;
  updateListDescription: string;
  yellow: string;
};

/**
 * Both the standalone edit dialog and the consolidated list settings dialog
 * render the same fields, so the label lookup lives here rather than being
 * spelled out at each call site.
 */
export function useListGeneralLabels(): ListGeneralLabels {
  const t = useTranslations('common');

  return {
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
    review: t('list_name_review'),
    saveChanges: t('save_changes'),
    saving: t('saving'),
    statusCategory: t('status_category'),
    updateListDescription: t('change_list_name'),
    yellow: t('yellow'),
  };
}

function useColorOptions(labels: ListGeneralLabels) {
  return useMemo(
    () => [
      { value: 'GRAY' as SupportedColor, label: labels.gray },
      { value: 'RED' as SupportedColor, label: labels.red },
      { value: 'BLUE' as SupportedColor, label: labels.blue },
      { value: 'GREEN' as SupportedColor, label: labels.green },
      { value: 'YELLOW' as SupportedColor, label: labels.yellow },
      { value: 'ORANGE' as SupportedColor, label: labels.orange },
      { value: 'PURPLE' as SupportedColor, label: labels.purple },
      { value: 'PINK' as SupportedColor, label: labels.pink },
      { value: 'INDIGO' as SupportedColor, label: labels.indigo },
      { value: 'CYAN' as SupportedColor, label: labels.cyan },
    ],
    [labels]
  );
}

const colorSwatchClass: Record<SupportedColor, string> = {
  GRAY: 'bg-dynamic-gray/30',
  RED: 'bg-dynamic-red/30',
  BLUE: 'bg-dynamic-blue/30',
  GREEN: 'bg-dynamic-green/30',
  YELLOW: 'bg-dynamic-yellow/30',
  ORANGE: 'bg-dynamic-orange/30',
  PURPLE: 'bg-dynamic-purple/30',
  PINK: 'bg-dynamic-pink/30',
  INDIGO: 'bg-dynamic-indigo/30',
  CYAN: 'bg-dynamic-cyan/30',
};

/**
 * The list's own attributes — name, status category, colour. Rendered without
 * any dialog chrome so the caller decides whether it sits in a dialog of its
 * own or in a tab alongside the board's capacity rules.
 */
export function ListGeneralForm({
  allowedStatuses,
  idPrefix = 'edit-list',
  isSaving = false,
  labels,
  list,
  onCancel,
  onSave,
}: {
  allowedStatuses?: TaskBoardStatus[];
  idPrefix?: string;
  isSaving?: boolean;
  labels: ListGeneralLabels;
  list: EditableList;
  onCancel: () => void;
  onSave: (payload: ListGeneralSavePayload) => void;
}) {
  const resolvedAllowedStatuses = useMemo(() => {
    if (allowedStatuses && allowedStatuses.length > 0) {
      return allowedStatuses;
    }

    return statuses;
  }, [allowedStatuses]);

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
  const colorOptions = useColorOptions(labels);

  const statusLabels: Record<TaskBoardStatus, string> = {
    not_started: labels.backlog,
    active: labels.active,
    review: labels.review,
    done: labels.done,
    closed: labels.closed,
    documents: labels.documents,
  };

  return (
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
        <Label htmlFor={`${idPrefix}-name`}>{labels.listName}</Label>
        <Input
          id={`${idPrefix}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={labels.listName}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-status`}>{labels.statusCategory}</Label>
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
          <SelectTrigger id={`${idPrefix}-status`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {resolvedAllowedStatuses.map((itemStatus) => {
              const Icon = statusConfig[itemStatus].icon;
              return (
                <SelectItem key={itemStatus} value={itemStatus}>
                  <div className="flex items-center gap-2">
                    <Icon
                      className={cn('h-4 w-4', statusConfig[itemStatus].color)}
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
        <div className="grid grid-cols-5 gap-2 sm:gap-3">
          {colorOptions.map((colorOption) => (
            <button
              aria-label={colorOption.label}
              aria-pressed={color === colorOption.value}
              type="button"
              key={colorOption.value}
              onClick={() => setColor(colorOption.value)}
              className={cn(
                'size-10 rounded-lg border-2 transition-all hover:scale-105',
                'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                colorSwatchClass[colorOption.value],
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
          onClick={onCancel}
          disabled={isSaving}
        >
          {labels.cancel}
        </Button>
        <Button type="submit" disabled={isSaving || !name.trim()}>
          {isSaving ? labels.saving : labels.saveChanges}
        </Button>
      </DialogFooter>
    </form>
  );
}
