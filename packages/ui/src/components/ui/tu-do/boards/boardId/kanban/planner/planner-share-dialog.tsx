'use client';

import { useMutation } from '@tanstack/react-query';
import { Loader2, Share2 } from '@tuturuuu/icons';
import {
  createWorkspaceTaskPlanShare,
  isTaskPlanSchemaUnavailable,
  type TaskPlan,
  type TaskPlanPermission,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface PlannerShareDialogProps {
  onOpenChange: (open: boolean) => void;
  onShared: () => void;
  open: boolean;
  plan: TaskPlan;
  targetWorkspaceId: string | null;
  targetWorkspaceName: string | null;
  workspaceId: string;
}

export function PlannerShareDialog({
  onOpenChange,
  onShared,
  open,
  plan,
  targetWorkspaceId,
  targetWorkspaceName,
  workspaceId,
}: PlannerShareDialogProps) {
  const t = useTranslations('ws-task-plans');
  const tCommon = useTranslations('common');
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState<TaskPlanPermission>('view');

  const shareMutation = useMutation({
    mutationFn: (recipient: 'email' | 'workspace') => {
      if (recipient === 'workspace' && targetWorkspaceId) {
        return createWorkspaceTaskPlanShare(workspaceId, plan.id, {
          shared_with_ws_id: targetWorkspaceId,
          permission,
        });
      }

      return createWorkspaceTaskPlanShare(workspaceId, plan.id, {
        shared_with_email: email.trim(),
        permission,
      });
    },
    onSuccess: (response) => {
      if (isTaskPlanSchemaUnavailable(response)) {
        toast.error(t('schema_unavailable'));
        return;
      }

      setEmail('');
      onShared();
      toast.success(t('share_saved'));
    },
    onError: () => toast.error(tCommon('error')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('share_plan')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_8rem] gap-2">
            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t('share_email_placeholder')}
              type="email"
            />
            <Select
              value={permission}
              onValueChange={(value) =>
                setPermission(value as TaskPlanPermission)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="view">{t('permission_view')}</SelectItem>
                <SelectItem value="edit">{t('permission_edit')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              onClick={() => shareMutation.mutate('email')}
              disabled={!email.trim() || shareMutation.isPending}
              className="gap-2"
            >
              {shareMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Share2 className="h-4 w-4" />
              )}
              {t('share_email')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => shareMutation.mutate('workspace')}
              disabled={!targetWorkspaceId || shareMutation.isPending}
            >
              {targetWorkspaceName
                ? t('share_workspace_name', { name: targetWorkspaceName })
                : t('share_workspace')}
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tCommon('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
