'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getWorkspaceCalendarSettings,
  listTopicAnnouncementContacts,
  listTopicAnnouncements,
  listTopicAnnouncementTemplates,
  listWorkspaceBasicUsers,
  listWorkspaceUserGroups,
  type TopicAnnouncementContact,
  type TopicAnnouncementContactPayload,
  type TopicAnnouncementImportPayload,
  type TopicAnnouncementPayload,
  type TopicAnnouncementRecord,
  type TopicAnnouncementTemplatePayload,
  type TopicAnnouncementTemplateRecord,
  type WorkspaceBasicUserRecord,
} from '@tuturuuu/internal-api';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { parseAsInteger, parseAsString, useQueryState } from 'nuqs';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { RequireWorkspaceTimezoneDialog } from '../../calendar/components/require-workspace-timezone-dialog';
import type { TemplateFormValues } from './template-form-dialog';
import { useTopicAnnouncementActions } from './topic-announcements-actions';
import { isSchedulingTimezoneReady } from './topic-announcements-scheduling';

interface ImportResult {
  batchId?: string;
  createdAnnouncements: number;
  createdContacts: number;
  rowErrors: { message: string; rowNumber: number }[];
}

interface TopicAnnouncementPendingState {
  cancelSchedule: boolean;
  createAnnouncement: boolean;
  createContact: boolean;
  createTemplate: boolean;
  deleteTemplate: boolean;
  importRows: boolean;
  schedule: boolean;
  send: boolean;
  updateTemplate: boolean;
  verify: boolean;
}

interface TopicAnnouncementActions {
  cancelSchedule: (announcementId: string) => void;
  createAnnouncement: (payload: TopicAnnouncementPayload) => void;
  createContact: (payload: TopicAnnouncementContactPayload) => void;
  createTemplate: (payload: TopicAnnouncementTemplatePayload) => void;
  deleteTemplate: (templateId: string) => void;
  importRows: (payload: TopicAnnouncementImportPayload) => void;
  requestTimezone: () => void;
  saveTemplateFromForm: (values: TemplateFormValues) => void;
  schedule: (announcementId: string, scheduledSendAt: string) => void;
  send: (announcementId: string) => void;
  updateTemplate: (
    templateId: string,
    payload: Partial<TopicAnnouncementTemplatePayload>
  ) => void;
  verify: (contactId: string) => void;
}

interface TopicAnnouncementFilters {
  page: number;
  query: string;
  setPage: (page: number) => void;
  setQuery: (query: string) => void;
  setStatus: (status: string) => void;
  status: string;
  totalPages: number;
}

export interface TopicAnnouncementOverview {
  announcementCount: number;
  contactCount: number;
  deliveredCount: number;
  pendingContactCount: number;
  queuedAnnouncementCount: number;
  readyContactCount: number;
  templateCount: number;
}

interface TopicAnnouncementsContextValue {
  actions: TopicAnnouncementActions;
  announcements: TopicAnnouncementRecord[];
  canSend: boolean;
  contacts: TopicAnnouncementContact[];
  deliveredAnnouncements: TopicAnnouncementRecord[];
  filters: TopicAnnouncementFilters;
  groups: UserGroup[];
  importResult: ImportResult | null;
  isLoading: {
    announcements: boolean;
    contacts: boolean;
    delivered: boolean;
    groups: boolean;
    templates: boolean;
    users: boolean;
  };
  overview: TopicAnnouncementOverview;
  pending: TopicAnnouncementPendingState;
  schedulingTimezone: string | null;
  templates: TopicAnnouncementTemplateRecord[];
  workspaceUsers: WorkspaceBasicUserRecord[];
  wsId: string;
}

const TopicAnnouncementsContext =
  createContext<TopicAnnouncementsContextValue | null>(null);

export function useTopicAnnouncements() {
  const context = useContext(TopicAnnouncementsContext);
  if (!context) {
    throw new Error('useTopicAnnouncements must be used within provider');
  }
  return context;
}

export function TopicAnnouncementsProvider({
  canSend,
  children,
  wsId,
}: {
  canSend: boolean;
  children: ReactNode;
  wsId: string;
}) {
  const queryClient = useQueryClient();
  const [timezoneDialogOpen, setTimezoneDialogOpen] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [status, setStatusQuery] = useQueryState(
    'status',
    parseAsString.withDefault('all').withOptions({ shallow: true })
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

  const calendarSettingsQuery = useQuery({
    queryFn: () => getWorkspaceCalendarSettings(wsId),
    queryKey: ['topic-announcement-calendar-settings', wsId],
  });
  const contactsQuery = useQuery({
    queryFn: () => listTopicAnnouncementContacts(wsId),
    queryKey: ['topic-announcement-contacts', wsId],
  });
  const templatesQuery = useQuery({
    queryFn: () => listTopicAnnouncementTemplates(wsId),
    queryKey: ['topic-announcement-templates', wsId],
  });
  const announcementsQuery = useQuery({
    queryFn: () =>
      listTopicAnnouncements(wsId, {
        page,
        pageSize: 20,
        q: query,
        status,
      }),
    queryKey: ['topic-announcements', wsId, page, query, status],
  });
  const deliveredAnnouncementsQuery = useQuery({
    queryFn: () =>
      listTopicAnnouncements(wsId, {
        page: 1,
        pageSize: 100,
        status: 'sent',
      }),
    queryKey: ['topic-announcements-delivered', wsId],
  });
  const usersQuery = useQuery({
    queryFn: () => listWorkspaceBasicUsers(wsId, { from: 0, limit: 200 }),
    queryKey: ['topic-announcement-workspace-users', wsId],
  });
  const groupsQuery = useQuery({
    queryFn: () =>
      listWorkspaceUserGroups(wsId, {
        page: 1,
        pageSize: 200,
        status: 'active',
      }),
    queryKey: ['topic-announcement-user-groups', wsId],
  });

  const invalidate = useCallback(() => {
    for (const queryKey of [
      ['topic-announcement-contacts', wsId],
      ['topic-announcement-templates', wsId],
      ['topic-announcements', wsId],
      ['topic-announcements-delivered', wsId],
      ['topic-announcement-calendar-settings', wsId],
    ]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  }, [queryClient, wsId]);

  const mutations = useTopicAnnouncementActions({
    invalidate,
    onImportSuccess: setImportResult,
    wsId,
  });

  const contacts = contactsQuery.data?.data ?? [];
  const templates = templatesQuery.data?.data ?? [];
  const workspaceUsers = usersQuery.data?.data ?? [];
  const groups = groupsQuery.data?.data ?? [];
  const announcements = announcementsQuery.data?.data ?? [];
  const deliveredAnnouncements = deliveredAnnouncementsQuery.data?.data ?? [];
  const schedulingTimezone = isSchedulingTimezoneReady(
    calendarSettingsQuery.data?.timezone
  )
    ? (calendarSettingsQuery.data?.timezone ?? null)
    : null;

  const overview = useMemo<TopicAnnouncementOverview>(
    () => ({
      announcementCount: announcementsQuery.data?.count ?? announcements.length,
      contactCount: contacts.length,
      deliveredCount:
        deliveredAnnouncementsQuery.data?.count ??
        deliveredAnnouncements.length,
      pendingContactCount: contacts.filter(
        (contact) => contact.verificationStatus === 'pending'
      ).length,
      queuedAnnouncementCount: announcements.filter(
        (announcement) => announcement.status === 'queued'
      ).length,
      readyContactCount: contacts.filter((contact) =>
        ['verified', 'linked_confirmed_account'].includes(
          contact.verificationStatus
        )
      ).length,
      templateCount: templates.length,
    }),
    [
      announcements,
      announcementsQuery.data?.count,
      contacts,
      deliveredAnnouncements.length,
      deliveredAnnouncementsQuery.data?.count,
      templates.length,
    ]
  );

  const value = useMemo<TopicAnnouncementsContextValue>(
    () => ({
      actions: createActions({
        mutations,
        setTimezoneDialogOpen,
      }),
      announcements,
      canSend,
      contacts,
      deliveredAnnouncements,
      filters: {
        page: announcementsQuery.data?.page ?? page,
        query,
        setPage: (nextPage) => void setPageState(nextPage),
        setQuery: (nextQuery) => {
          void setQueryState(nextQuery);
          void setPageState(1);
        },
        setStatus: (nextStatus) => {
          void setStatusQuery(nextStatus);
          void setPageState(1);
        },
        status,
        totalPages: announcementsQuery.data?.totalPages ?? 1,
      },
      groups,
      importResult,
      isLoading: {
        announcements: announcementsQuery.isLoading,
        contacts: contactsQuery.isLoading,
        delivered: deliveredAnnouncementsQuery.isLoading,
        groups: groupsQuery.isLoading,
        templates: templatesQuery.isLoading,
        users: usersQuery.isLoading,
      },
      overview,
      pending: {
        cancelSchedule: mutations.cancelScheduleMutation.isPending,
        createAnnouncement: mutations.createAnnouncementMutation.isPending,
        createContact: mutations.createContactMutation.isPending,
        createTemplate: mutations.createTemplateMutation.isPending,
        deleteTemplate: mutations.deleteTemplateMutation.isPending,
        importRows: mutations.importMutation.isPending,
        schedule: mutations.scheduleMutation.isPending,
        send: mutations.sendMutation.isPending,
        updateTemplate: mutations.updateTemplateMutation.isPending,
        verify: mutations.verifyMutation.isPending,
      },
      schedulingTimezone,
      templates,
      workspaceUsers,
      wsId,
    }),
    [
      announcements,
      announcementsQuery.data?.page,
      announcementsQuery.data?.totalPages,
      announcementsQuery.isLoading,
      canSend,
      contacts,
      contactsQuery.isLoading,
      deliveredAnnouncements,
      deliveredAnnouncementsQuery.isLoading,
      groups,
      groupsQuery.isLoading,
      importResult,
      mutations,
      overview,
      page,
      query,
      schedulingTimezone,
      setPageState,
      setQueryState,
      setStatusQuery,
      status,
      templates,
      templatesQuery.isLoading,
      usersQuery.isLoading,
      workspaceUsers,
      wsId,
    ]
  );

  return (
    <TopicAnnouncementsContext.Provider value={value}>
      {children}
      {timezoneDialogOpen && !schedulingTimezone ? (
        <RequireWorkspaceTimezoneDialog
          onCompleted={() => {
            setTimezoneDialogOpen(false);
            invalidate();
          }}
          wsId={wsId}
        />
      ) : null}
    </TopicAnnouncementsContext.Provider>
  );
}

function createActions({
  mutations,
  setTimezoneDialogOpen,
}: {
  mutations: ReturnType<typeof useTopicAnnouncementActions>;
  setTimezoneDialogOpen: (value: boolean) => void;
}): TopicAnnouncementActions {
  return {
    cancelSchedule: (announcementId) =>
      mutations.cancelScheduleMutation.mutate(announcementId),
    createAnnouncement: (payload) =>
      mutations.createAnnouncementMutation.mutate(payload),
    createContact: (payload) => mutations.createContactMutation.mutate(payload),
    createTemplate: (payload) =>
      mutations.createTemplateMutation.mutate(payload),
    deleteTemplate: (templateId) =>
      mutations.deleteTemplateMutation.mutate(templateId),
    importRows: (payload) => mutations.importMutation.mutate(payload),
    requestTimezone: () => setTimezoneDialogOpen(true),
    saveTemplateFromForm: (values) => {
      mutations.createTemplateMutation.mutate({
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
    },
    schedule: (announcementId, scheduledSendAt) =>
      mutations.scheduleMutation.mutate({ announcementId, scheduledSendAt }),
    send: (announcementId) => mutations.sendMutation.mutate(announcementId),
    updateTemplate: (templateId, payload) =>
      mutations.updateTemplateMutation.mutate({ payload, templateId }),
    verify: (contactId) => mutations.verifyMutation.mutate(contactId),
  };
}
