'use client';

import { KanbanSquare, ListTodo } from '@tuturuuu/icons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import TemplatesClient from './client';
import type { WorkspaceTaskTemplate } from './task-template-api';
import { TaskTemplateClient } from './task-template-client';
import type { BoardTemplate } from './types';

interface TaskTemplatesHubProps {
  boardTemplates: BoardTemplate[];
  taskTemplates?: WorkspaceTaskTemplate[];
  templatesBasePath?: string;
  wsId: string;
}

export function TaskTemplatesHub({
  boardTemplates,
  taskTemplates = [],
  templatesBasePath = 'templates',
  wsId,
}: TaskTemplatesHubProps) {
  const t = useTranslations('ws-task-templates');

  return (
    <Tabs defaultValue="tasks" className="space-y-4">
      <TabsList>
        <TabsTrigger value="tasks">
          <ListTodo className="h-4 w-4" />
          {t('tabs.tasks')}
        </TabsTrigger>
        <TabsTrigger value="boards">
          <KanbanSquare className="h-4 w-4" />
          {t('tabs.boards')}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="tasks">
        <TaskTemplateClient initialTemplates={taskTemplates} wsId={wsId} />
      </TabsContent>
      <TabsContent value="boards">
        <TemplatesClient
          initialTemplates={boardTemplates}
          templatesBasePath={templatesBasePath}
          wsId={wsId}
        />
      </TabsContent>
    </Tabs>
  );
}
