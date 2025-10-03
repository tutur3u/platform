'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Flag,
  NotebookPen,
  Archive,
} from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import TaskListWithCompletion from '../../(dashboard)/tasks/task-list-with-completion';
import QuickJournal from '../../(dashboard)/quick-journal';
import BucketDump from '../../(dashboard)/bucket-dump';
import EmptyState from './empty-state';

interface Task {
  id: string;
  name: string;
  description?: string | null;
  priority?: string | null;
  end_date?: string | null;
  start_date?: string | null;
  estimation_points?: number | null;
  archived?: boolean | null;
  list_id?: string | null;
  list: {
    id: string;
    name: string | null;
    status?: string | null;
    board: {
      id: string;
      name: string | null;
      ws_id: string;
      estimation_type?: string | null;
      extended_estimation?: boolean;
      allow_zero_estimates?: boolean;
      workspaces: {
        id: string;
        name: string | null;
        personal: boolean | null;
      } | null;
    } | null;
  } | null;
  assignees: Array<{
    user: {
      id: string;
      display_name: string | null;
      avatar_url?: string | null;
    } | null;
  }> | null;
  labels?: Array<{
    label: {
      id: string;
      name: string;
      color: string;
      created_at: string;
    } | null;
  }> | null;
}

interface MyTasksContentProps {
  wsId: string;
  isPersonal: boolean;
  overdueTasks: Task[] | undefined;
  todayTasks: Task[] | undefined;
  upcomingTasks: Task[] | undefined;
  totalActiveTasks: number;
}

export default function MyTasksContent({
  wsId,
  isPersonal,
  overdueTasks,
  todayTasks,
  upcomingTasks,
  totalActiveTasks,
}: MyTasksContentProps) {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState('tasks');

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid h-auto w-full grid-cols-3">
        <TabsTrigger
          value="tasks"
          className="flex-col gap-1.5 py-2 sm:flex-row sm:py-1.5"
        >
          <CheckCircle2 className="h-4 w-4" />
          <span className="text-xs sm:text-sm">
            {t('sidebar_tabs.my_tasks')}
          </span>
        </TabsTrigger>
        <TabsTrigger
          value="journal"
          className="flex-col gap-1.5 py-2 sm:flex-row sm:py-1.5"
        >
          <NotebookPen className="h-4 w-4" />
          <span className="text-xs sm:text-sm">Journal</span>
        </TabsTrigger>
        <TabsTrigger
          value="bucket"
          className="flex-col gap-1.5 py-2 sm:flex-row sm:py-1.5"
        >
          <Archive className="h-4 w-4" />
          <span className="text-xs sm:text-sm">Bucket</span>
        </TabsTrigger>
      </TabsList>

      {/* My Tasks Tab */}
      <TabsContent value="tasks" className="mt-6 space-y-6">
        {/* Overdue Tasks */}
        {overdueTasks && overdueTasks.length > 0 && (
          <Card className="border-dynamic-red/20">
            <CardHeader className="border-b border-dynamic-red/10 bg-dynamic-red/5">
              <CardTitle className="flex items-center gap-2 text-dynamic-red">
                <Clock className="h-5 w-5" />
                {t('ws-tasks.overdue')} ({overdueTasks.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <TaskListWithCompletion
                tasks={overdueTasks as any}
                isPersonal={isPersonal}
                initialLimit={5}
              />
            </CardContent>
          </Card>
        )}

        {/* Due Today */}
        {todayTasks && todayTasks.length > 0 && (
          <Card className="border-dynamic-orange/20">
            <CardHeader className="border-b border-dynamic-orange/10 bg-dynamic-orange/5">
              <CardTitle className="flex items-center gap-2 text-dynamic-orange">
                <Calendar className="h-5 w-5" />
                {t('ws-tasks.due_today')} ({todayTasks.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <TaskListWithCompletion
                tasks={todayTasks as any}
                isPersonal={isPersonal}
                initialLimit={5}
              />
            </CardContent>
          </Card>
        )}

        {/* Upcoming Tasks */}
        {upcomingTasks && upcomingTasks.length > 0 && (
          <Card className="border-dynamic-blue/20">
            <CardHeader className="border-b border-dynamic-blue/10 bg-dynamic-blue/5">
              <CardTitle className="flex items-center gap-2 text-dynamic-blue">
                <Flag className="h-5 w-5" />
                {t('ws-tasks.upcoming')} ({upcomingTasks.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <TaskListWithCompletion
                tasks={upcomingTasks as any}
                isPersonal={isPersonal}
                initialLimit={5}
              />
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {totalActiveTasks === 0 && (
          <EmptyState wsId={wsId} onSwitchToJournal={() => setActiveTab('journal')} />
        )}
      </TabsContent>

      {/* Quick Journal Tab */}
      <TabsContent value="journal" className="mt-6">
        <QuickJournal wsId={wsId} enabled={true} />
      </TabsContent>

      {/* Bucket Dump Tab */}
      <TabsContent value="bucket" className="mt-6">
        <BucketDump wsId={wsId} enabled={true} />
      </TabsContent>
    </Tabs>
  );
}
