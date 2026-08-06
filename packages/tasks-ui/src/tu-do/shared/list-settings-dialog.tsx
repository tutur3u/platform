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
          <DialogDescription>{list.name}</DialogDescription>
        </DialogHeader>

        <Tabs className="space-y-4" defaultValue="general">
          <TabsList>
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
