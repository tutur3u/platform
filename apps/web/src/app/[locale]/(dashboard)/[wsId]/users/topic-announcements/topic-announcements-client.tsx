'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createTopicAnnouncement,
  createTopicAnnouncementContact,
  importTopicAnnouncements,
  listTopicAnnouncementContacts,
  listTopicAnnouncements,
  listWorkspaceBasicUsers,
  requestTopicAnnouncementContactVerification,
  sendTopicAnnouncement,
  type TopicAnnouncementContactPayload,
  type TopicAnnouncementPayload,
} from '@tuturuuu/internal-api';
import { toast } from '@tuturuuu/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { parseAsInteger, parseAsString, useQueryState } from 'nuqs';
import { ContactsPanel } from './topic-announcements-contacts';
import { DeliveryPanel } from './topic-announcements-delivery';
import { ImportPanel } from './topic-announcements-import';
import { AnnouncementsPanel } from './topic-announcements-panels';

interface Props {
  canSend: boolean;
  wsId: string;
}

export function TopicAnnouncementsClient({ canSend, wsId }: Props) {
  const t = useTranslations('ws-topic-announcements');
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

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: ['topic-announcement-contacts', wsId],
    });
    void queryClient.invalidateQueries({
      queryKey: ['topic-announcements', wsId],
    });
  };

  const createContactMutation = useMutation({
    mutationFn: (payload: TopicAnnouncementContactPayload) =>
      createTopicAnnouncementContact(wsId, payload),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('contact_failed')),
    onSuccess: () => {
      toast.success(t('contact_created'));
      invalidate();
    },
  });
  const createAnnouncementMutation = useMutation({
    mutationFn: (payload: TopicAnnouncementPayload) =>
      createTopicAnnouncement(wsId, payload),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('create_failed')),
    onSuccess: () => {
      toast.success(t('announcement_created'));
      invalidate();
    },
  });
  const verifyMutation = useMutation({
    mutationFn: (contactId: string) =>
      requestTopicAnnouncementContactVerification(wsId, contactId),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('verify_failed')),
    onSuccess: () => {
      toast.success(t('verify_sent'));
      invalidate();
    },
  });
  const sendMutation = useMutation({
    mutationFn: (announcementId: string) =>
      sendTopicAnnouncement(wsId, announcementId),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('send_failed')),
    onSuccess: () => {
      toast.success(t('sent'));
      invalidate();
    },
  });
  const importMutation = useMutation({
    mutationFn: (rows: Parameters<typeof importTopicAnnouncements>[1]) =>
      importTopicAnnouncements(wsId, rows),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('import_failed')),
    onSuccess: (result) => {
      toast.success(
        t('imported', { count: result.createdAnnouncements.toString() })
      );
      invalidate();
    },
  });

  const contacts = contactsQuery.data?.data ?? [];
  const workspaceUsers = usersQuery.data?.data ?? [];

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl">{t('title')}</h1>
          <p className="text-muted-foreground text-sm">{t('description')}</p>
        </div>
        <TabsList>
          <TabsTrigger value="announcements">
            {t('tab_announcements')}
          </TabsTrigger>
          <TabsTrigger value="contacts">{t('tab_contacts')}</TabsTrigger>
          <TabsTrigger value="import">{t('tab_import')}</TabsTrigger>
          <TabsTrigger value="delivery">{t('tab_delivery')}</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="announcements">
        <AnnouncementsPanel
          announcements={announcementsQuery.data?.data ?? []}
          canSend={canSend}
          contacts={contacts}
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
