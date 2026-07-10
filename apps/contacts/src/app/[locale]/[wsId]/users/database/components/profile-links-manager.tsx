'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Copy, Plus, Search, Trash2 } from '@tuturuuu/icons';
import {
  deleteWorkspaceUserProfileLink,
  listWorkspaceUserProfileLinks,
  listWorkspaceUserProfileLinkUsers,
  updateWorkspaceUserProfileLink,
  type WorkspaceUserProfileLinkSummary,
  type WorkspaceUserProfileLinkTargetUser,
} from '@tuturuuu/internal-api/users';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { RequestProfileDetailsDialog } from './request-profile-details-dialog';

function getTargetUserLabel(user: WorkspaceUserProfileLinkTargetUser | null) {
  if (!user) return null;
  return (
    user.display_name ||
    user.full_name ||
    user.email ||
    user.phone ||
    user.id.slice(0, 8)
  );
}

function TargetUserDetails({
  targetUser,
}: {
  targetUser: WorkspaceUserProfileLinkTargetUser | null;
}) {
  const t = useTranslations('ws-user-profile-links');

  if (!targetUser) {
    return (
      <p className="text-muted-foreground text-sm">{t('target_missing')}</p>
    );
  }

  const privateValue = (value: string | null) =>
    targetUser.private_fields_hidden
      ? t('target_private_hidden')
      : value || t('target_empty_value');

  const details = [
    {
      label: t('field_display_name'),
      value: targetUser.display_name || t('target_empty_value'),
    },
    {
      label: t('field_full_name'),
      value: targetUser.full_name || t('target_empty_value'),
    },
    { label: t('field_email'), value: privateValue(targetUser.email) },
    { label: t('field_phone'), value: privateValue(targetUser.phone) },
    { label: t('field_birthday'), value: privateValue(targetUser.birthday) },
    { label: t('field_gender'), value: privateValue(targetUser.gender) },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {details.map((detail) => (
        <div key={detail.label} className="rounded-lg border bg-muted/30 p-3">
          <p className="text-muted-foreground text-xs">{detail.label}</p>
          <p className="mt-1 truncate font-medium text-sm">{detail.value}</p>
        </div>
      ))}
    </div>
  );
}

export function ProfileLinksManager({ wsId }: { wsId: string }) {
  const t = useTranslations('ws-user-profile-links');
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [userPickerOpen, setUserPickerOpen] = useState(false);
  const [specificCreateOpen, setSpecificCreateOpen] = useState(false);
  const [userQuery, setUserQuery] = useState('');
  const [selectedTargetUser, setSelectedTargetUser] =
    useState<WorkspaceUserProfileLinkTargetUser | null>(null);

  const queryKey = ['workspace-user-profile-links', wsId];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => listWorkspaceUserProfileLinks(wsId),
  });

  const targetUsersQuery = useQuery({
    queryKey: ['workspace-user-profile-link-users', wsId, userQuery],
    queryFn: () =>
      listWorkspaceUserProfileLinkUsers(wsId, {
        limit: 20,
        q: userQuery,
      }),
    enabled: userPickerOpen,
  });

  const mutate = useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: 'revoke' | 'delete';
    }) =>
      action === 'delete'
        ? deleteWorkspaceUserProfileLink(wsId, id)
        : updateWorkspaceUserProfileLink(wsId, id, { revoked: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('update_error')),
  });

  const copyLink = async (code: string) => {
    await navigator.clipboard.writeText(
      `${window.location.origin}/shared/user-profile/${code}`
    );
    toast.success(t('link_copied'));
  };

  const statusBadge = (link: WorkspaceUserProfileLinkSummary) => {
    if (link.is_revoked) return t('status_revoked');
    if (link.is_expired) return t('status_expired');
    if (link.is_full) return t('status_full');
    return t('status_active');
  };

  const links = data?.links ?? [];
  const targetUsers = targetUsersQuery.data?.data ?? [];
  const selectedTargetUserLabel = getTargetUserLabel(selectedTargetUser);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-sm">
          {t('manager_description')}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setUserPickerOpen(true)}
          >
            <Search className="mr-2 h-4 w-4" />
            {t('create_specific_button')}
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t('create_generic_button')}
          </Button>
        </div>
      </div>

      <RequestProfileDetailsDialog
        wsId={wsId}
        mode="generic"
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      {selectedTargetUser ? (
        <RequestProfileDetailsDialog
          wsId={wsId}
          mode="per_user"
          targetUserId={selectedTargetUser.id}
          targetUserLabel={selectedTargetUserLabel}
          open={specificCreateOpen}
          onOpenChange={(open) => {
            setSpecificCreateOpen(open);
            if (!open) setSelectedTargetUser(null);
          }}
        />
      ) : null}

      <Dialog open={userPickerOpen} onOpenChange={setUserPickerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('select_target_user_title')}</DialogTitle>
            <DialogDescription>
              {t('select_target_user_description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={userQuery}
                onChange={(event) => setUserQuery(event.target.value)}
                placeholder={t('select_target_user_search_placeholder')}
                className="pl-9"
              />
            </div>

            <div className="max-h-80 space-y-2 overflow-y-auto">
              {targetUsersQuery.isLoading ? (
                <p className="text-muted-foreground text-sm">
                  {t('select_target_user_loading')}
                </p>
              ) : targetUsers.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {t('select_target_user_empty')}
                </p>
              ) : (
                targetUsers.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    className="flex w-full items-start justify-between gap-3 rounded-lg border p-3 text-left hover:bg-muted/50"
                    onClick={() => {
                      setSelectedTargetUser(user);
                      setUserPickerOpen(false);
                      setSpecificCreateOpen(true);
                    }}
                  >
                    <span>
                      <span className="block font-medium text-sm">
                        {getTargetUserLabel(user)}
                      </span>
                      <span className="block text-muted-foreground text-xs">
                        {user.private_fields_hidden
                          ? t('target_private_hidden')
                          : [user.email, user.phone]
                              .filter(Boolean)
                              .join(' · ') || t('target_empty_value')}
                      </span>
                    </span>
                    {user.archived ? (
                      <Badge variant="outline">{t('target_archived')}</Badge>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">{t('loading')}</p>
      ) : links.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('empty')}</p>
      ) : (
        <div className="space-y-3">
          {links.map((link) => (
            <Collapsible key={link.id} className="rounded-xl border p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">
                      {link.mode === 'generic'
                        ? t('mode_generic')
                        : t('mode_per_user')}
                    </Badge>
                    <Badge variant="outline">{statusBadge(link)}</Badge>
                    <Badge variant="outline">
                      {link.prefill_existing_values
                        ? t('prefill_visible_badge')
                        : t('prefill_hidden_badge')}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {t('uses_label', {
                        current: link.current_uses,
                        max: link.max_uses ?? '∞',
                      })}
                    </span>
                  </div>
                  {link.target_user ? (
                    <p className="font-medium text-sm">
                      {getTargetUserLabel(link.target_user)}
                    </p>
                  ) : null}
                  <p className="text-muted-foreground text-xs">
                    {link.allowed_fields
                      .map((field) => t(`field_${field}` as never))
                      .join(', ')}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {link.mode === 'per_user' ? (
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm">
                        {t('details_toggle')}
                        <ChevronDown className="ml-1 h-4 w-4" />
                      </Button>
                    </CollapsibleTrigger>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyLink(link.code)}
                  >
                    <Copy className="mr-1 h-4 w-4" />
                    {t('copy_link')}
                  </Button>
                  {!link.is_revoked ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={mutate.isPending}
                      onClick={() =>
                        mutate.mutate({ id: link.id, action: 'revoke' })
                      }
                    >
                      {t('revoke')}
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={mutate.isPending}
                    onClick={() =>
                      mutate.mutate({ id: link.id, action: 'delete' })
                    }
                  >
                    <Trash2 className="h-4 w-4 text-dynamic-red" />
                  </Button>
                </div>
              </div>
              {link.mode === 'per_user' ? (
                <CollapsibleContent className="pt-4">
                  <TargetUserDetails targetUser={link.target_user} />
                </CollapsibleContent>
              ) : null}
            </Collapsible>
          ))}
        </div>
      )}
    </div>
  );
}
