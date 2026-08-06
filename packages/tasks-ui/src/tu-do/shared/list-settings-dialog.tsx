'use client';

import { Gauge, Settings2 } from '@tuturuuu/icons';
import type { TaskBoardStatus } from '@tuturuuu/types/primitives/TaskBoard';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { CapacityRulesSettings } from '../boards/capacity-rules-settings';
import {
  type EditableList,
  ListGeneralForm,
  type ListGeneralSavePayload,
  useListGeneralLabels,
} from './list-general-form';

/**
 * One place to configure a list. The list's own attributes and the capacity
 * rules that govern it used to be two separate dialogs reached from two menu
 * entries, which meant leaving one to reach the other even though they answer
 * the same question: how should this list behave?
 */
const listColorDotClass: Record<string, string> = {
  BLUE: 'bg-dynamic-blue',
  CYAN: 'bg-dynamic-cyan',
  GRAY: 'bg-dynamic-gray',
  GREEN: 'bg-dynamic-green',
  INDIGO: 'bg-dynamic-indigo',
  ORANGE: 'bg-dynamic-orange',
  PINK: 'bg-dynamic-pink',
  PURPLE: 'bg-dynamic-purple',
  RED: 'bg-dynamic-red',
  YELLOW: 'bg-dynamic-yellow',
};

export function ListSettingsDialog({
  allowedStatuses,
  boardId,
  isSaving = false,
  lists,
  list,
  onOpenChange,
  onSave,
  open,
  wsId,
}: {
  allowedStatuses?: TaskBoardStatus[];
  boardId: string;
  isSaving?: boolean;
  list: EditableList | null;
  lists: TaskList[];
  onOpenChange: (open: boolean) => void;
  onSave: (payload: ListGeneralSavePayload) => void;
  open: boolean;
  wsId?: string;
}) {
  const t = useTranslations('common');
  const capacityT = useTranslations('ws-board-templates.capacity');
  const labels = useListGeneralLabels();

  if (!open || !list) {
    return null;
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('list_settings')}</DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <span
              aria-hidden
              className={cn(
                'size-2.5 shrink-0 rounded-full',
                listColorDotClass[list.color ?? 'GRAY']
              )}
            />
            <span className="truncate">{list.name}</span>
          </DialogDescription>
        </DialogHeader>

        <Tabs className="space-y-4" defaultValue="general">
          <TabsList className="grid w-full grid-cols-2 sm:inline-flex sm:w-auto">
            <TabsTrigger value="general">
              <Settings2 className="h-4 w-4" />
              {t('general')}
            </TabsTrigger>
            {wsId && (
              <TabsTrigger value="capacity">
                <Gauge className="h-4 w-4" />
                {capacityT('title')}
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="general">
            <ListGeneralForm
              key={list.id}
              allowedStatuses={allowedStatuses}
              idPrefix="list-settings"
              isSaving={isSaving}
              labels={labels}
              list={list}
              onCancel={() => onOpenChange(false)}
              onSave={onSave}
            />
          </TabsContent>

          {wsId && (
            <TabsContent value="capacity">
              <CapacityRulesSettings
                boardId={boardId}
                embedded
                initialListId={list.id}
                lists={lists}
                wsId={wsId}
              />
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
