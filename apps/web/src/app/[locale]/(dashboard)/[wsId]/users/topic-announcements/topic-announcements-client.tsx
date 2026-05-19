'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listTopicAnnouncementContacts,
  listTopicAnnouncements,
  listWorkspaceBasicUsers,
  listWorkspaceUserGroups,
} from '@tuturuuu/internal-api';
import { Tabs, TabsContent } from '@tuturuuu/ui/tabs';
import { parseAsInteger, parseAsString, useQueryState } from 'nuqs';
import { useMemo } from 'react';
import { useTopicAnnouncementActions } from './topic-announcements-actions';
import { ContactsPanel } from './topic-announcements-contacts';
import { DeliveryPanel } from './topic-announcements-delivery';
import { TopicAnnouncementsHeader } from './topic-announcements-header';
import { ImportPanel } from './topic-announcements-import';
import { AnnouncementsPanel } from './topic-announcements-panels';
import { TopicAnnouncementsTabs } from './topic-announcements-tabs';

interface Props {
  canSend: boolean;
  wsId: string;
}

export function TopicAnnouncementsClient({ canSend, wsId }: Props) {
  const queryClient = useQueryClient();
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

  const contactsQuery = useQuery({
    queryFn: () => listTopicAnnouncementContacts(wsId),
    queryKey: ['topic-announcement-contacts', wsId],
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
      queryKey: ['topic-announcements', wsId],
    });
  };
  const {
    createAnnouncementMutation,
    createContactMutation,
    importMutation,
    sendMutation,
    verifyMutation,
  } = useTopicAnnouncementActions({ invalidate, wsId });

  const contacts = contactsQuery.data?.data ?? [];
  const workspaceUsers = usersQuery.data?.data ?? [];
  const groups = groupsQuery.data?.data ?? [];
  const announcementCount =
    announcementsQuery.data?.count ?? announcementsQuery.data?.data.length ?? 0;
  const contactStats = useMemo(
    () => ({
      pending: contacts.filter(
        (contact) => contact.verificationStatus === 'pending'
      ).length,
      ready: contacts.filter((contact) =>
        ['verified', 'linked_confirmed_account'].includes(
          contact.verificationStatus
        )
      ).length,
    }),
    [contacts]
  );

  return (
    <Tabs className="space-y-4" value={tab} onValueChange={setTab}>
      <TopicAnnouncementsHeader
        announcementCount={announcementCount}
        contactCount={contacts.length}
        pendingContactCount={contactStats.pending}
        readyContactCount={contactStats.ready}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <TopicAnnouncementsTabs />
      </div>

      <TabsContent value="announcements">
        <AnnouncementsPanel
          announcements={announcementsQuery.data?.data ?? []}
          canSend={canSend}
          contacts={contacts}
          groups={groups}
          isCreating={createAnnouncementMutation.isPending}
          isLoading={announcementsQuery.isLoading}
          isSending={sendMutation.isPending}
          onCreate={(payload) => createAnnouncementMutation.mutate(payload)}
          onPageChange={setPage}
          onQueryChange={setQuery}
          onSend={(id) => sendMutation.mutate(id)}
          onStatusChange={setStatus}
          page={announcementsQuery.data?.page ?? page}
          query={query}
          status={status}
          totalPages={announcementsQuery.data?.totalPages ?? 1}
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
      <TabsContent value="import">
        <ImportPanel
          isImporting={importMutation.isPending}
          onImport={(payload) => importMutation.mutate(payload)}
        />
      </TabsContent>
      <TabsContent value="delivery">
        <DeliveryPanel announcements={announcementsQuery.data?.data ?? []} />
      </TabsContent>
    </Tabs>
  );
}
