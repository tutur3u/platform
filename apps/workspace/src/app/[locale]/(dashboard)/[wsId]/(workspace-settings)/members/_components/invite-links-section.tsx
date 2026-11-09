'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, RefreshCw } from '@tuturuuu/icons';
import {
  createWorkspaceInviteLink,
  deleteWorkspaceInviteLink,
  getWorkspaceInviteLink,
  InternalApiError,
  listWorkspaceInviteLinks,
  updateWorkspaceInviteLink,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import {
  SettingsSection,
  SettingsSectionMessage,
} from '@tuturuuu/ui/custom/settings-section';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import moment from 'moment';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { getPayBillingUrl } from '@/lib/pay-app-url';
import {
  type InviteLinkDetails,
  type InviteLinkSummary,
  mapInviteLinkRowFromApi,
  normalizeInviteLinkDetails,
  type RawInviteLinkDetails,
} from '@/lib/workspace-invite-links';
import { InviteLinkCard } from './invite-link-card';
import {
  InviteLinkFormDialog,
  type InviteLinkFormValues,
} from './invite-link-form-dialog';
import { InviteLinkMembersDialog } from './invite-link-members-dialog';

interface Props {
  canManageMembers: boolean;
  disableInvite?: boolean;
  wsId: string;
}

const inviteLinksKey = (wsId: string) =>
  ['workspace', wsId, 'invite-links'] as const;

function toMutationPayload(values: InviteLinkFormValues) {
  return {
    expiresAt: values.expiresAt
      ? new Date(values.expiresAt).toISOString()
      : null,
    maxUses: values.maxUses,
    memberType: values.memberType,
  };
}

function toEditValues(link: InviteLinkSummary): InviteLinkFormValues {
  return {
    expiresAt: link.expires_at
      ? moment(link.expires_at).format('YYYY-MM-DDTHH:mm')
      : null,
    maxUses: link.max_uses,
    memberType: link.memberType === 'GUEST' ? 'GUEST' : 'MEMBER',
  };
}

export default function InviteLinksSection({
  canManageMembers,
  disableInvite = false,
  wsId,
}: Props) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingLink, setEditingLink] = useState<InviteLinkSummary | null>(
    null
  );
  const [viewingLinkId, setViewingLinkId] = useState<string | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const linksQuery = useQuery<InviteLinkSummary[]>({
    queryKey: inviteLinksKey(wsId),
    queryFn: async () => {
      const rows = await listWorkspaceInviteLinks(wsId);
      return rows.map(mapInviteLinkRowFromApi);
    },
    staleTime: 30_000,
  });

  const viewingLinkQuery = useQuery<InviteLinkDetails>({
    queryKey: [...inviteLinksKey(wsId), viewingLinkId],
    queryFn: async () =>
      normalizeInviteLinkDetails(
        (await getWorkspaceInviteLink(
          wsId,
          viewingLinkId ?? ''
        )) as unknown as RawInviteLinkDetails
      ),
    enabled: Boolean(viewingLinkId && viewDialogOpen),
  });

  const invalidateInviteLinks = () =>
    queryClient.invalidateQueries({ queryKey: inviteLinksKey(wsId) });

  const showCreateError = (error: Error) => {
    if (
      error instanceof InternalApiError &&
      error.code === 'SEAT_LIMIT_REACHED'
    ) {
      toast.error(t('ws-invite-links.seat-limit-reached'), {
        action: {
          label: t('ws-invite-links.manage-billing'),
          onClick: () => window.location.assign(getPayBillingUrl(wsId)),
        },
        description: t('ws-invite-links.seat-limit-reached-description'),
        duration: 10_000,
      });
      return;
    }

    toast.error(error.message || t('ws-invite-links.create-error'));
  };

  const createMutation = useMutation({
    mutationFn: (values: InviteLinkFormValues) =>
      createWorkspaceInviteLink(wsId, toMutationPayload(values)),
    onError: showCreateError,
    onSuccess: async () => {
      toast.success(t('ws-invite-links.create-success'));
      setCreateOpen(false);
      await invalidateInviteLinks();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      linkId,
      values,
    }: {
      linkId: string;
      values: InviteLinkFormValues;
    }) => updateWorkspaceInviteLink(wsId, linkId, toMutationPayload(values)),
    onError: (error: Error) =>
      toast.error(error.message || t('ws-invite-links.update-error')),
    onSuccess: async () => {
      toast.success(t('ws-invite-links.link-updated'));
      setEditingLink(null);
      await invalidateInviteLinks();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (linkId: string) => deleteWorkspaceInviteLink(wsId, linkId),
    onError: (error: Error) =>
      toast.error(error.message || t('ws-invite-links.delete-error')),
    onSuccess: async () => {
      toast.success(t('ws-invite-links.delete-success'));
      setConfirmDeleteId(null);
      await invalidateInviteLinks();
    },
  });

  const copyInviteLink = async (code: string, linkId: string) => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/invite/${code}`
      );
      setCopiedId(linkId);
      toast.success(t('ws-invite-links.copy-success'));
      window.setTimeout(() => setCopiedId(null), 2_000);
    } catch (error) {
      console.error('Failed to copy invite link:', error);
      toast.error(t('ws-invite-links.copy-error'));
    }
  };

  const openLinkDetails = (linkId: string) => {
    setViewingLinkId(linkId);
    setViewDialogOpen(true);
  };

  const links = linksQuery.data ?? [];

  return (
    <section aria-labelledby="workspace-invite-links-title">
      <SettingsSection
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => void linksQuery.refetch()}
              disabled={linksQuery.isFetching}
              title={t('common.refresh')}
              aria-label={t('common.refresh')}
              className="h-9 w-9"
            >
              <RefreshCw
                className={`h-4 w-4 ${linksQuery.isFetching ? 'animate-spin' : ''}`}
              />
            </Button>
            {canManageMembers ? (
              <Button
                onClick={() => setCreateOpen(true)}
                disabled={disableInvite}
                className="h-9 gap-2"
                title={
                  disableInvite
                    ? t('ws-members.invite_member_disabled')
                    : undefined
                }
              >
                <Plus className="h-4 w-4" />
                <span className="sr-only sm:not-sr-only">
                  {disableInvite
                    ? t('ws-members.invite_member_disabled')
                    : t('ws-invite-links.create-link')}
                </span>
              </Button>
            ) : null}
          </div>
        }
        description={t('ws-invite-links.description')}
        title={
          <span id="workspace-invite-links-title">
            {t('ws-invite-links.title')}
          </span>
        }
      >
        {linksQuery.isPending ? (
          <SettingsSectionMessage
            icon={<Loader2 className="h-4 w-4 animate-spin" />}
          >
            {t('common.loading')}
          </SettingsSectionMessage>
        ) : linksQuery.isError ? (
          <SettingsSectionMessage
            tone="error"
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => void linksQuery.refetch()}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {t('common.retry')}
              </Button>
            }
          >
            {t('ws-invite-links.fetch-error')}
          </SettingsSectionMessage>
        ) : links.length === 0 ? (
          <SettingsSectionMessage>
            <div className="space-y-1">
              <h4 className="font-medium text-foreground">
                {t('ws-invite-links.no-links')}
              </h4>
              <p>{t('ws-invite-links.no-links-description')}</p>
            </div>
          </SettingsSectionMessage>
        ) : (
          links.map((link) => (
            <InviteLinkCard
              key={link.id}
              canManageMembers={canManageMembers}
              copied={copiedId === link.id}
              link={link}
              onCopy={() => void copyInviteLink(link.code, link.id)}
              onDelete={() => setConfirmDeleteId(link.id)}
              onEdit={() => setEditingLink(link)}
              onViewMembers={() => openLinkDetails(link.id)}
            />
          ))
        )}
      </SettingsSection>

      <InviteLinkFormDialog
        key="create-invite-link"
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        isSubmitting={createMutation.isPending}
        onSubmit={(values) => createMutation.mutate(values)}
      />

      {editingLink ? (
        <InviteLinkFormDialog
          key={editingLink.id}
          mode="edit"
          open
          onOpenChange={(open) => !open && setEditingLink(null)}
          initialValues={toEditValues(editingLink)}
          isSubmitting={updateMutation.isPending}
          onSubmit={(values) =>
            updateMutation.mutate({ linkId: editingLink.id, values })
          }
        />
      ) : null}

      <InviteLinkMembersDialog
        open={viewDialogOpen}
        onOpenChange={(open) => {
          setViewDialogOpen(open);
          if (!open) setViewingLinkId(null);
        }}
        inviteLink={viewingLinkQuery.data}
        isLoading={viewingLinkQuery.isLoading}
        isError={viewingLinkQuery.isError}
        onRetry={() => void viewingLinkQuery.refetch()}
      />

      <Dialog
        open={Boolean(confirmDeleteId)}
        onOpenChange={(open) => !open && setConfirmDeleteId(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('ws-invite-links.delete-confirm-title')}
            </DialogTitle>
            <DialogDescription>
              {t('ws-invite-links.delete-confirm')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setConfirmDeleteId(null)}
              disabled={deleteMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                confirmDeleteId && deleteMutation.mutate(confirmDeleteId)
              }
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending
                ? t('common.deleting')
                : t('common.delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
