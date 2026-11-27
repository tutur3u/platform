'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  CheckSquare,
  HardDrive,
  LockKeyhole,
  MessageSquare,
  Video,
} from '@tuturuuu/icons';
import { LoadingRegion, Skeleton, SkeletonList } from '@tuturuuu/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  loadPersonalTools,
  type PersonalToolsApi,
  type PersonalToolsSnapshot,
  type PersonalToolsTab,
  personalToolsApi,
  personalToolsFailureKeepsSnapshot,
} from '../lib/personal-tools';
import { CallPanelHeader } from '../tools/tool-ui';
import { PersonalCalendarTab } from './personal-tools/calendar-tab';
import { PersonalChatTab } from './personal-tools/chat-tab';
import { PersonalDriveTab } from './personal-tools/drive-tab';
import { PersonalMeetingsTab } from './personal-tools/meetings-tab';
import { PersonalTasksTab } from './personal-tools/tasks-tab';
import { ResizableCallPanel } from './resizable-call-panel';

const PERSONAL_TABS = [
  { value: 'tasks', icon: CheckSquare, labelKey: 'tasks' },
  { value: 'calendar', icon: CalendarDays, labelKey: 'calendar' },
  { value: 'meetings', icon: Video, labelKey: 'meetings' },
  { value: 'chat', icon: MessageSquare, labelKey: 'chat' },
  { value: 'drive', icon: HardDrive, labelKey: 'drive' },
] as const;

export function PersonalToolsPanel({
  accountId,
  onClose,
  api = personalToolsApi,
}: {
  accountId: string;
  onClose: () => void;
  api?: PersonalToolsApi;
}) {
  const t = useTranslations('meet.call.private_tools');
  const cache = useQueryClient();
  const [activeTab, setActiveTab] = useState<PersonalToolsTab>('tasks');
  const key = ['meet-personal-tools', accountId] as const;
  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      loadPersonalTools(
        accountId,
        api,
        new Date(),
        cache.getQueryData<PersonalToolsSnapshot>(key)
      ),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });
  const data =
    query.isError && !personalToolsFailureKeepsSnapshot(query.error)
      ? null
      : query.data;

  return (
    <ResizableCallPanel label={t('title')} onClose={onClose}>
      <CallPanelHeader
        icon={CalendarDays}
        title={t('title')}
        subtitle={
          <>
            <LockKeyhole className="size-3" />
            {t('private')}
          </>
        }
        closeLabel={t('close')}
        onClose={onClose}
      />
      {query.isPending ? (
        <LoadingRegion srLabel={t('loading')} className="space-y-3 p-4">
          <Skeleton aria-hidden="true" className="h-9 w-full" />
          <SkeletonList rows={4} withAvatar={false} />
        </LoadingRegion>
      ) : !data ? (
        <p role="status" className="p-4 text-muted-foreground text-sm">
          {t('unavailable')}
        </p>
      ) : (
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as PersonalToolsTab)}
          className="flex min-h-0 flex-1 flex-col gap-3 p-4"
        >
          <TabsList className="grid h-auto w-full grid-cols-5 gap-1 p-1">
            {PERSONAL_TABS.map(({ value, icon: Icon, labelKey }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="flex flex-col items-center gap-0.5 px-1 py-1.5 text-[11px]"
              >
                <Icon className="size-3.5 shrink-0" />
                <span className="w-full truncate text-center">
                  {t(labelKey)}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="tasks" className="min-h-0 overflow-auto">
            <PersonalTasksTab data={data} />
          </TabsContent>
          <TabsContent value="calendar" className="min-h-0 overflow-auto">
            <PersonalCalendarTab data={data} />
          </TabsContent>
          <TabsContent value="meetings" className="min-h-0 overflow-auto">
            <PersonalMeetingsTab
              accountId={accountId}
              workspace={data.workspace}
              active={activeTab === 'meetings'}
              api={api}
            />
          </TabsContent>
          <TabsContent value="chat" className="min-h-0 overflow-auto">
            <PersonalChatTab
              accountId={accountId}
              workspace={data.workspace}
              active={activeTab === 'chat'}
              api={api}
            />
          </TabsContent>
          <TabsContent value="drive" className="min-h-0 overflow-auto">
            <PersonalDriveTab
              accountId={accountId}
              workspace={data.workspace}
              active={activeTab === 'drive'}
              api={api}
            />
          </TabsContent>
        </Tabs>
      )}
    </ResizableCallPanel>
  );
}
