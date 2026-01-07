'use client';

import { Copy } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Label } from '@tuturuuu/ui/label';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { useTranslations } from 'next-intl';
import type { TaskShareLink } from '../hooks/use-task-sharing';

interface ShareLinkSettingsProps {
  shareLink: TaskShareLink;
  wsId: string;
  creating: boolean;
  onCopyLink: (code: string) => void;
  onTogglePublicAccess: (enabled: boolean) => void;
  onToggleInviteOnly: (enabled: boolean) => void;
}

export function ShareLinkSettings({
  shareLink,
  wsId,
  creating,
  onCopyLink,
  onTogglePublicAccess,
  onToggleInviteOnly,
}: ShareLinkSettingsProps) {
  const t = useTranslations();

  return (
    <div className="space-y-3">
      <Label>{t('common.task_sharing.copy_link')}</Label>

      <div className="space-y-2 rounded-lg border p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Copy className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground text-sm">
              {shareLink.public_access === 'view'
                ? t('common.task_sharing.anyone_with_link_can_view')
                : t('common.task_sharing.only_invited_people')}
            </span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onCopyLink(shareLink.code)}
            disabled={creating}
          >
            {t('common.task_sharing.copy_link')}
          </Button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={shareLink.public_access === 'view'}
              onCheckedChange={(checked) =>
                onTogglePublicAccess(Boolean(checked))
              }
              disabled={creating || shareLink.requires_invite}
            />
            <span className="text-sm">
              {t('common.task_sharing.public_access')}
            </span>
          </div>

          {wsId === ROOT_WORKSPACE_ID && (
            <div className="flex items-center gap-2">
              <Checkbox
                checked={shareLink.requires_invite}
                onCheckedChange={(checked) =>
                  onToggleInviteOnly(Boolean(checked))
                }
                disabled={creating}
              />
              <span className="text-sm">
                {t('common.task_sharing.invite_only')}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
