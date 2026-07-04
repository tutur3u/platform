'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Plus } from '@tuturuuu/icons';
import {
  createTopicAnnouncementContact,
  deleteTopicAnnouncementContact,
  listTopicAnnouncementContacts,
  listWorkspaceBasicUsers,
  requestTopicAnnouncementContactVerification,
  type TopicAnnouncementContact,
  type TopicAnnouncementContactPayload,
  type WorkspaceBasicUserRecord,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ContactsPanel } from './contacts-panel';

interface TopicAnnouncementsContactsPageClientProps {
  canSend: boolean;
  initialContacts: TopicAnnouncementContact[];
  initialWorkspaceUsers: WorkspaceBasicUserRecord[];
  wsId: string;
}

export function TopicAnnouncementsContactsPageClient({
  canSend,
  initialContacts,
  initialWorkspaceUsers,
  wsId,
}: TopicAnnouncementsContactsPageClientProps) {
  const t = useTranslations('ws-topic-announcements');
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const contactsQueryKey = ['topic-announcement-contacts', wsId] as const;
  const usersQueryKey = ['topic-announcement-workspace-users', wsId] as const;

  const contactsQuery = useQuery({
    initialData: { data: initialContacts },
    queryFn: () => listTopicAnnouncementContacts(wsId),
    queryKey: contactsQueryKey,
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

  const invalidateContacts = () => {
    void queryClient.invalidateQueries({ queryKey: contactsQueryKey });
  };

  const createContactMutation = useMutation({
    mutationFn: (payload: TopicAnnouncementContactPayload) =>
      createTopicAnnouncementContact(wsId, payload),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('contact_failed')),
    onSuccess: () => {
      toast.success(t('contact_created'));
      invalidateContacts();
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: (contactId: string) =>
      deleteTopicAnnouncementContact(wsId, contactId),
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : t('contact_remove_failed')
      ),
    onSuccess: () => {
      toast.success(t('contact_removed'));
      invalidateContacts();
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (contactId: string) =>
      requestTopicAnnouncementContactVerification(wsId, contactId),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('verify_failed')),
    onSuccess: (result) => {
      toast.success(
        result.alreadyPending ? t('verify_pending_toast') : t('verify_sent')
      );
      invalidateContacts();
    },
  });

  const contacts = contactsQuery.data.data;
  const workspaceUsers = usersQuery.data.data;

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
            {t('contacts_page_description')}
          </p>
          <Button
            className="gap-2"
            onClick={() => setIsAddDialogOpen(true)}
            type="button"
          >
            <Plus className="h-4 w-4" />
            {t('add_contact')}
          </Button>
        </div>

        <ContactsPanel
          canSend={canSend}
          contacts={contacts}
          isAddDialogOpen={isAddDialogOpen}
          isCreating={createContactMutation.isPending}
          isDeleting={deleteContactMutation.isPending}
          isLoading={
            (contactsQuery.isPending && contacts.length === 0) ||
            (usersQuery.isPending && workspaceUsers.length === 0)
          }
          isVerifying={verifyMutation.isPending}
          onAddDialogOpenChange={setIsAddDialogOpen}
          onCreate={(payload) => createContactMutation.mutate(payload)}
          onDelete={(contactId) => deleteContactMutation.mutate(contactId)}
          onVerify={(contactId) => {
            if (!canSend) return;
            verifyMutation.mutate(contactId);
          }}
          workspaceUsers={workspaceUsers}
          wsId={wsId}
        />
      </div>
    </div>
  );
}
