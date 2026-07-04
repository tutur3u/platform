'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone } from '@tuturuuu/icons';
import {
  cancelTopicAnnouncementSchedule,
  createTopicAnnouncement,
  createTopicAnnouncementTemplate,
  deleteTopicAnnouncement,
  listTopicAnnouncementContacts,
  listTopicAnnouncements,
  listTopicAnnouncementTemplates,
  listWorkspaceBasicUsers,
  listWorkspaceUserGroups,
  scheduleTopicAnnouncement,
  sendTopicAnnouncement,
  type TopicAnnouncementContact,
  type TopicAnnouncementPayload,
  type TopicAnnouncementRecord,
  type TopicAnnouncementTemplatePayload,
  type TopicAnnouncementTemplateRecord,
  type WorkspaceBasicUserRecord,
} from '@tuturuuu/internal-api';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import {
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
} from 'nuqs';
import type { TemplateFormValues } from '../template-form-dialog';
import { AnnouncementsPanel } from './announcements-panel';

const TOPIC_ANNOUNCEMENTS_PAGE_SIZE = 20;
const DEFAULT_STATUS = 'active';
const ANNOUNCEMENT_STATUS_FILTERS = [
  'active',
  'all',
  'cancelled',
  'draft',
  'failed',
  'processing',
  'queued',
  'sent',
  'skipped',
] as const;
type AnnouncementStatusFilter = (typeof ANNOUNCEMENT_STATUS_FILTERS)[number];

interface TopicAnnouncementsListData {
  count: number;
  data: TopicAnnouncementRecord[];
  page: number;
  pageSize: number;
  totalPages: number;
}

interface TopicAnnouncementsAnnouncementsPageClientProps {
  canSend: boolean;
  initialAnnouncements: TopicAnnouncementsListData;
  initialContacts: TopicAnnouncementContact[];
  initialGroups: UserGroup[];
  initialTemplates: TopicAnnouncementTemplateRecord[];
  initialWorkspaceUsers: WorkspaceBasicUserRecord[];
  locale: string;
  schedulingTimezone: string | null;
  wsId: string;
}

export function TopicAnnouncementsAnnouncementsPageClient({
  canSend,
  initialAnnouncements,
  initialContacts,
  initialGroups,
  initialTemplates,
  initialWorkspaceUsers,
  locale,
  schedulingTimezone,
  wsId,
}: TopicAnnouncementsAnnouncementsPageClientProps) {
  const t = useTranslations('ws-topic-announcements');
  const queryClient = useQueryClient();
  const [status, setStatusQuery] = useQueryState(
    'status',
    parseAsStringLiteral(ANNOUNCEMENT_STATUS_FILTERS)
      .withDefault(DEFAULT_STATUS)
      .withOptions({ shallow: true })
  );
  const [query, setQueryState] = useQueryState(
    'q',
    parseAsString
      .withDefault('')
      .withOptions({ shallow: true, throttleMs: 300 })
  );
  const [page, setPageState] = useQueryState(
    'page',
    parseAsInteger.withDefault(1).withOptions({ shallow: true })
  );
  const safePage = Math.max(1, page);

  const announcementsQueryKey = [
    'topic-announcements',
    wsId,
    safePage,
    query,
    status,
  ] as const;
  const contactsQueryKey = ['topic-announcement-contacts', wsId] as const;
  const deliveredQueryKey = ['topic-announcements-delivered', wsId] as const;
  const templatesQueryKey = ['topic-announcement-templates', wsId] as const;
  const groupsQueryKey = ['topic-announcement-user-groups', wsId] as const;
  const usersQueryKey = ['topic-announcement-workspace-users', wsId] as const;

  const isDefaultAnnouncementsQuery =
    safePage === 1 && query.trim() === '' && status === DEFAULT_STATUS;

  const announcementsQuery = useQuery({
    initialData: isDefaultAnnouncementsQuery ? initialAnnouncements : undefined,
    queryFn: () =>
      listTopicAnnouncements(wsId, {
        page: safePage,
        pageSize: TOPIC_ANNOUNCEMENTS_PAGE_SIZE,
        q: query,
        status,
      }),
    queryKey: announcementsQueryKey,
    staleTime: 30_000,
  });
  const contactsQuery = useQuery({
    initialData: { data: initialContacts },
    queryFn: () => listTopicAnnouncementContacts(wsId),
    queryKey: contactsQueryKey,
    staleTime: 30_000,
  });
  const templatesQuery = useQuery({
    initialData: { data: initialTemplates },
    queryFn: () => listTopicAnnouncementTemplates(wsId),
    queryKey: templatesQueryKey,
    staleTime: 30_000,
  });
  const groupsQuery = useQuery({
    initialData: {
      count: initialGroups.length,
      data: initialGroups,
      page: 1,
      pageSize: Math.max(initialGroups.length, 1),
    },
    queryFn: () =>
      listWorkspaceUserGroups(wsId, {
        page: 1,
        pageSize: 200,
        status: 'active',
      }),
    queryKey: groupsQueryKey,
    staleTime: 30_000,
  });
  const usersQuery = useQuery({
    initialData: {
      count: initialWorkspaceUsers.length,
      data: initialWorkspaceUsers,
    },
    queryFn: () => listWorkspaceBasicUsers(wsId, { from: 0, limit: 200 }),
    queryKey: usersQueryKey,
    staleTime: 30_000,
  });

  const invalidateAnnouncementData = () => {
    for (const queryKey of [
      ['topic-announcements', wsId],
      contactsQueryKey,
      deliveredQueryKey,
      templatesQueryKey,
    ]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };

  const createAnnouncementMutation = useMutation({
    mutationFn: (payload: TopicAnnouncementPayload) =>
      createTopicAnnouncement(wsId, payload),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('create_failed')),
    onSuccess: () => {
      toast.success(t('announcement_created'));
      invalidateAnnouncementData();
    },
  });
  const deleteAnnouncementMutation = useMutation({
    mutationFn: (announcementId: string) =>
      deleteTopicAnnouncement(wsId, announcementId),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('delete_failed')),
    onSuccess: () => {
      toast.success(t('announcement_removed'));
      invalidateAnnouncementData();
    },
  });
  const sendMutation = useMutation({
    mutationFn: (announcementId: string) =>
      sendTopicAnnouncement(wsId, announcementId),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('send_failed')),
    onSuccess: () => {
      toast.success(t('sent'));
      invalidateAnnouncementData();
    },
  });
  const scheduleMutation = useMutation({
    mutationFn: ({
      announcementId,
      scheduledSendAt,
    }: {
      announcementId: string;
      scheduledSendAt: string;
    }) => scheduleTopicAnnouncement(wsId, announcementId, { scheduledSendAt }),
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : t('schedule_send_failed');
      if (message.includes('WORKSPACE_TIMEZONE_REQUIRED')) {
        toast.error(t('workspace_timezone_required'));
        return;
      }
      toast.error(message);
    },
    onSuccess: () => {
      toast.success(t('schedule_send_success'));
      invalidateAnnouncementData();
    },
  });
  const cancelScheduleMutation = useMutation({
    mutationFn: (announcementId: string) =>
      cancelTopicAnnouncementSchedule(wsId, announcementId),
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : t('cancel_schedule_failed')
      ),
    onSuccess: () => {
      toast.success(t('cancel_schedule_success'));
      invalidateAnnouncementData();
    },
  });
  const createTemplateMutation = useMutation({
    mutationFn: (payload: TopicAnnouncementTemplatePayload) =>
      createTopicAnnouncementTemplate(wsId, payload),
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : t('template_save_failed')
      ),
    onSuccess: () => {
      toast.success(t('template_saved'));
      invalidateAnnouncementData();
    },
  });

  const announcements = announcementsQuery.data?.data ?? [];
  const contacts = contactsQuery.data.data;
  const templates = templatesQuery.data.data;
  const groups = groupsQuery.data.data;
  const workspaceUsers = usersQuery.data.data;
  const pageData = announcementsQuery.data ?? initialAnnouncements;

  const createAndSchedule = async (
    payload: TopicAnnouncementPayload,
    scheduledSendAt: string
  ) => {
    const result = await createAnnouncementMutation.mutateAsync(payload);
    await scheduleMutation.mutateAsync({
      announcementId: result.data.id,
      scheduledSendAt,
    });
  };

  const createAndSend = async (payload: TopicAnnouncementPayload) => {
    const result = await createAnnouncementMutation.mutateAsync(payload);
    await sendMutation.mutateAsync(result.data.id);
  };

  const saveTemplateFromForm = (values: TemplateFormValues) => {
    createTemplateMutation.mutate({
      defaultContactIds: values.defaultContactIds,
      endTime: values.endTime || null,
      groupId: values.groupId.startsWith('__') ? null : values.groupId,
      name: values.name,
      place: values.place || null,
      room: values.room || null,
      startTime: values.startTime || null,
      title: values.title,
      topic: values.topic,
    });
  };

  const showTimezoneRequired = () => {
    toast.error(t('workspace_timezone_required'));
  };

  const setStatusFilter = (nextStatus: string) => {
    if (!isAnnouncementStatusFilter(nextStatus)) {
      void setStatusQuery(DEFAULT_STATUS);
      void setPageState(1);
      return;
    }

    void setStatusQuery(nextStatus);
    void setPageState(1);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md border border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue">
          <Megaphone className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">
            {t('title')}
          </h1>
          <p className="text-muted-foreground text-sm">{t('description')}</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <p className="max-w-3xl text-muted-foreground text-sm">
            {t('announcements_page_description')}
          </p>
        </div>

        <AnnouncementsPanel
          announcements={announcements}
          canSend={canSend}
          contacts={contacts}
          groups={groups}
          isCreating={createAnnouncementMutation.isPending}
          isDeleting={deleteAnnouncementMutation.isPending}
          isLoading={
            (announcementsQuery.isPending && announcements.length === 0) ||
            (contactsQuery.isPending && contacts.length === 0) ||
            (templatesQuery.isPending && templates.length === 0) ||
            (groupsQuery.isPending && groups.length === 0) ||
            (usersQuery.isPending && workspaceUsers.length === 0)
          }
          isSavingTemplate={createTemplateMutation.isPending}
          isScheduling={
            scheduleMutation.isPending || cancelScheduleMutation.isPending
          }
          isSending={sendMutation.isPending}
          locale={locale}
          onCancelSchedule={(announcementId) =>
            cancelScheduleMutation.mutate(announcementId)
          }
          onCreate={(payload) =>
            createAnnouncementMutation.mutateAsync(payload).then(() => {
              // The form awaits this promise before resetting.
            })
          }
          onCreateAndSchedule={createAndSchedule}
          onCreateAndSend={createAndSend}
          onDelete={(announcementId) =>
            deleteAnnouncementMutation.mutate(announcementId)
          }
          onPageChange={(nextPage) => void setPageState(nextPage)}
          onQueryChange={(nextQuery) => {
            void setQueryState(nextQuery);
            void setPageState(1);
          }}
          onSaveTemplate={saveTemplateFromForm}
          onSchedule={(announcementId, scheduledSendAt) =>
            scheduleMutation.mutate({ announcementId, scheduledSendAt })
          }
          onSend={(announcementId) => sendMutation.mutate(announcementId)}
          onStatusChange={setStatusFilter}
          onTimezoneRequired={showTimezoneRequired}
          page={pageData.page}
          pageSize={pageData.pageSize}
          query={query}
          schedulingTimezone={schedulingTimezone}
          status={status}
          templates={templates}
          totalPages={pageData.totalPages}
          workspaceUsers={workspaceUsers}
          wsId={wsId}
        />
      </div>
    </div>
  );
}

function isAnnouncementStatusFilter(
  value: string
): value is AnnouncementStatusFilter {
  return ANNOUNCEMENT_STATUS_FILTERS.includes(
    value as AnnouncementStatusFilter
  );
}
