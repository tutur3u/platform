'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Plus, Trash2 } from '@tuturuuu/icons';
import {
  deleteWorkspaceUserProfileLink,
  listWorkspaceUserProfileLinks,
  updateWorkspaceUserProfileLink,
  type WorkspaceUserProfileLinkSummary,
} from '@tuturuuu/internal-api/users';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { RequestProfileDetailsDialog } from './request-profile-details-dialog';

export function ProfileLinksManager({ wsId }: { wsId: string }) {
  const t = useTranslations('ws-user-profile-links');
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const queryKey = ['workspace-user-profile-links', wsId];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => listWorkspaceUserProfileLinks(wsId),
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {t('manager_description')}
        </p>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('create_generic_button')}
        </Button>
      </div>

      <RequestProfileDetailsDialog
        wsId={wsId}
        mode="generic"
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      {isLoading ? (
        <p className="text-muted-foreground text-sm">{t('loading')}</p>
      ) : links.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('empty')}</p>
      ) : (
        <div className="space-y-3">
          {links.map((link) => (
            <div
              key={link.id}
              className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">
                    {link.mode === 'generic'
                      ? t('mode_generic')
                      : t('mode_per_user')}
                  </Badge>
                  <Badge variant="outline">{statusBadge(link)}</Badge>
                  <span className="text-muted-foreground text-xs">
                    {t('uses_label', {
                      current: link.current_uses,
                      max: link.max_uses ?? '∞',
                    })}
                  </span>
                </div>
                <p className="text-muted-foreground text-xs">
                  {link.allowed_fields
                    .map((field) => t(`field_${field}` as never))
                    .join(', ')}
                </p>
              </div>
              <div className="flex items-center gap-2">
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
          ))}
        </div>
      )}
    </div>
  );
}
