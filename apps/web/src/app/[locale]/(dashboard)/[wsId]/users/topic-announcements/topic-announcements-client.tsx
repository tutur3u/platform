'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listTopicAnnouncementContacts,
  listTopicAnnouncements,
  listTopicAnnouncementTemplates,
  listWorkspaceBasicUsers,
  listWorkspaceUserGroups,
  type TopicAnnouncementTemplatePayload,
} from '@tuturuuu/internal-api';
import { Tabs, TabsContent } from '@tuturuuu/ui/tabs';
import { parseAsInteger, parseAsString, useQueryState } from 'nuqs';
import { useMemo, useState } from 'react';
import { RequireWorkspaceTimezoneDialog } from '../../calendar/components/require-workspace-timezone-dialog';
import type { TemplateFormValues } from './template-form-dialog';
import { useTopicAnnouncementActions } from './topic-announcements-actions';
import { ContactsPanel } from './topic-announcements-contacts';
import { DeliveryPanel } from './topic-announcements-delivery';
import { TopicAnnouncementsHeader } from './topic-announcements-header';
import { ImportPanel } from './topic-announcements-import';
import { AnnouncementsPanel } from './topic-announcements-panels';
import { isSchedulingTimezoneReady } from './topic-announcements-scheduling';
import { TopicAnnouncementsTabs } from './topic-announcements-tabs';
import { TopicAnnouncementsTemplates } from './topic-announcements-templates';

interface Props {
  canSend: boolean;
  wsId: string;
}

export function TopicAnnouncementsClient({ canSend, wsId }: Props) {
  const queryClient = useQueryClient();
  const [timezoneDialogOpen, setTimezoneDialogOpen] = useState(false);
  const [tab, setTab] = useQueryState(
    'tab',
    parseAsString.withDefault('announcements').withOptions({ shallow: true })
  );
  const [status, setStatus] = useQueryState(
    'status',
    parseAsString.withDefault('all').withOptions({ shallow: true })
  );
  const [query, setQuery] = useQueryState(
    'q',
    parseAsString
      .withDefault('')
      .withOptions({ shallow: true, throttleMs: 300 })
  );
  const [page, setPage] = useQueryState(
    'page',
    parseAsInteger.withDefault(1).withOptions({ shallow: true })
  );

  const calendarSettingsQuery = useQuery({
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/calendar-settings`,
        { cache: 'no-store' }
      );
      if (!response.ok) {
        throw new Error('Failed to load workspace timezone');
      }
      return response.json() as Promise<{ timezone: string }>;
    },
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

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: ['topic-announcement-contacts', wsId],
    });
    void queryClient.invalidateQueries({
      queryKey: ['topic-announcement-templates', wsId],
    });
    void queryClient.invalidateQueries({
      queryKey: ['topic-announcements', wsId],
    });
    void queryClient.invalidateQueries({
      queryKey: ['topic-announcement-calendar-settings', wsId],
    });
  };

  const {
    cancelScheduleMutation,
    createAnnouncementMutation,
    createContactMutation,
    createTemplateMutation,
    deleteTemplateMutation,
    importMutation,
    scheduleMutation,
    sendMutation,
    updateTemplateMutation,
    verifyMutation,
  } = useTopicAnnouncementActions({ invalidate, wsId });

  const contacts = contactsQuery.data?.data ?? [];
  const templates = templatesQuery.data?.data ?? [];
  const workspaceUsers = usersQuery.data?.data ?? [];
  const groups = groupsQuery.data?.data ?? [];
  const announcements = announcementsQuery.data?.data ?? [];
  const schedulingTimezone = isSchedulingTimezoneReady(
    calendarSettingsQuery.data?.timezone
  )
    ? (calendarSettingsQuery.data?.timezone ?? null)
    : null;

  const contactStats = useMemo(
    () => ({
      pending: contacts.filter(
        (contact) => contact.verificationStatus === 'pending'
      ).length,
      queued: announcements.filter(
        (announcement) => announcement.status === 'queued'
      ).length,
      ready: contacts.filter((contact) =>
        ['verified', 'linked_confirmed_account'].includes(
          contact.verificationStatus
        )
      ).length,
    }),
    [announcements, contacts]
  );

  const saveTemplateFromForm = (values: TemplateFormValues) => {
    const payload: TopicAnnouncementTemplatePayload = {
      classLabel: values.classLabel || null,
      defaultContactIds: values.defaultContactIds,
      groupId: values.groupId.startsWith('__') ? null : values.groupId,
      name: values.name,
      place: values.place || null,
      room: values.room || null,
      startTime: values.startTime || null,
      title: values.title,
      topic: values.topic,
    };
    createTemplateMutation.mutate(payload);
  };

  return (
    <Tabs className="space-y-4" onValueChange={setTab} value={tab}>
      <TopicAnnouncementsHeader
        announcementCount={
          announcementsQuery.data?.count ?? announcements.length
        }
        contactCount={contacts.length}
        pendingContactCount={contactStats.pending}
        queuedAnnouncementCount={contactStats.queued}
        readyContactCount={contactStats.ready}
      />

      <TopicAnnouncementsTabs />

      <TabsContent value="announcements">
        <AnnouncementsPanel
          announcements={announcements}
          canSend={canSend}
          contacts={contacts}
          groups={groups}
          isCreating={createAnnouncementMutation.isPending}
          isLoading={announcementsQuery.isLoading}
          isSavingTemplate={createTemplateMutation.isPending}
          isScheduling={scheduleMutation.isPending}
          isSending={sendMutation.isPending}
          onCancelSchedule={(id) => cancelScheduleMutation.mutate(id)}
          onCreate={(payload) => createAnnouncementMutation.mutate(payload)}
          onPageChange={setPage}
          onQueryChange={setQuery}
          onSaveTemplate={saveTemplateFromForm}
          onSchedule={(announcementId, scheduledSendAt) =>
            scheduleMutation.mutate({ announcementId, scheduledSendAt })
          }
          onSend={(id) => sendMutation.mutate(id)}
          onStatusChange={setStatus}
          onTimezoneRequired={() => setTimezoneDialogOpen(true)}
          page={announcementsQuery.data?.page ?? page}
          query={query}
          schedulingTimezone={schedulingTimezone}
          status={status}
          templates={templates}
          totalPages={announcementsQuery.data?.totalPages ?? 1}
          workspaceUsers={workspaceUsers}
        />
      </TabsContent>
      <TabsContent value="contacts">
        <ContactsPanel
          contacts={contacts}
          isCreating={createContactMutation.isPending}
          isLoading={contactsQuery.isLoading}
          isVerifying={verifyMutation.isPending}
          onCreate={(payload) => createContactMutation.mutate(payload)}
          onVerify={(id) => verifyMutation.mutate(id)}
          workspaceUsers={workspaceUsers}
          wsId={wsId}
        />
      </TabsContent>
      <TabsContent value="templates">
        <TopicAnnouncementsTemplates
          groups={groups}
          isDeleting={deleteTemplateMutation.isPending}
          isLoading={templatesQuery.isLoading}
          isSaving={
            createTemplateMutation.isPending || updateTemplateMutation.isPending
          }
          onCreate={(payload) => createTemplateMutation.mutate(payload)}
          onDelete={(templateId) => deleteTemplateMutation.mutate(templateId)}
          onUpdate={(templateId, payload) =>
            updateTemplateMutation.mutate({ payload, templateId })
          }
          templates={templates}
        />
      </TabsContent>
      <TabsContent value="import">
        <ImportPanel
          isImporting={importMutation.isPending}
          onImport={(rows) => importMutation.mutate(rows)}
        />
      </TabsContent>
      <TabsContent value="delivery">
        <DeliveryPanel announcements={announcements} />
      </TabsContent>

      {timezoneDialogOpen && !schedulingTimezone ? (
        <RequireWorkspaceTimezoneDialog
          onCompleted={() => {
            setTimezoneDialogOpen(false);
            invalidate();
          }}
          wsId={wsId}
        />
      ) : null}
    </Tabs>
  );
}
