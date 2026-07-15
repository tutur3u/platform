'use client';

import { Loader2, User } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ShareLinkSettings } from './task-share-dialog/components/share-link-settings';
import { SharesList } from './task-share-dialog/components/shares-list';
import { useTaskSharing } from './task-share-dialog/hooks/use-task-sharing';

interface TaskShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  taskName: string;
  wsId: string;
}

export function TaskShareDialog({
  open,
  onOpenChange,
  taskId,
  taskName,
  wsId,
}: TaskShareDialogProps) {
  const t = useTranslations();
  const [email, setEmail] = useState('');

  const {
    shares,
    shareLink,
    loading,
    creating,
    showComingSoon,
    setShowComingSoon,
    handleAddShare,
    handleUpdatePermission,
    handleRemoveShare,
    handleCopyLink,
    handleToggleInviteOnly,
    handleTogglePublicAccess,
  } = useTaskSharing(wsId, taskId, open);

  const onAddShare = async () => {
    const success = await handleAddShare(email);
    if (success) setEmail('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-125">
        <DialogHeader>
          <DialogTitle>
            {t('common.task_sharing.share_task')} &quot;
            {taskName}&quot;
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Add people section */}
          <div className="space-y-2">
            <Label>{t('common.task_sharing.add_people')}</Label>
            <div className="flex gap-2">
              <Input
                placeholder={t('common.task_sharing.email_or_name')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onAddShare();
                }}
                disabled={creating}
              />
              <Button
                onClick={onAddShare}
                disabled={creating || !email.trim()}
                size="icon"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <User className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* People with access */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <SharesList
              shares={shares}
              onUpdatePermission={handleUpdatePermission}
              onRemoveShare={handleRemoveShare}
            />
          )}

          <Separator />

          {/* Copy link section */}
          {shareLink && (
            <ShareLinkSettings
              shareLink={shareLink}
              wsId={wsId}
              creating={creating}
              onCopyLink={handleCopyLink}
              onTogglePublicAccess={handleTogglePublicAccess}
              onToggleInviteOnly={handleToggleInviteOnly}
            />
          )}
        </div>
      </DialogContent>

      <Dialog open={showComingSoon} onOpenChange={setShowComingSoon}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('common.coming_soon')}</DialogTitle>
            <DialogDescription>
              Public access for tasks is currently only available to internal
              teams. This feature will be available to all workspaces soon!
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button onClick={() => setShowComingSoon(false)}>
              {t('common.got_it')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
