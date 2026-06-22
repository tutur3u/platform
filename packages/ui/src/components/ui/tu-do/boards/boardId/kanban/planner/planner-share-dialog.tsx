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
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
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
  const permissionOptions = [
    { value: 'view', label: t('permission_view') },
    { value: 'edit', label: t('permission_edit') },
  ];

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
            <Combobox
              mode="single"
              options={permissionOptions}
              selected={permission}
              onChange={(value) => setPermission(value as TaskPlanPermission)}
              placeholder={t('permission_view')}
            />
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

interface PlannerSharePanelProps {
  onShared: () => void;
  plan: TaskPlan;
  targetWorkspaceId: string | null;
  targetWorkspaceName: string | null;
  workspaceId: string;
}

export function PlannerSharePanel({
  onShared,
  plan,
  targetWorkspaceId,
  targetWorkspaceName,
  workspaceId,
}: PlannerSharePanelProps) {
  const t = useTranslations('ws-task-plans');
  const tCommon = useTranslations('common');
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState<TaskPlanPermission>('view');
  const permissionOptions = [
    { value: 'view', label: t('permission_view') },
    { value: 'edit', label: t('permission_edit') },
  ];

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
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
        <Input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t('share_email_placeholder')}
          type="email"
          className="h-9"
        />
        <Combobox
          mode="single"
          options={permissionOptions}
          selected={permission}
          onChange={(value) => setPermission(value as TaskPlanPermission)}
          placeholder={t('permission_view')}
          className="[&_button]:h-9"
        />
        <Button
          type="button"
          onClick={() => shareMutation.mutate('email')}
          disabled={!email.trim() || shareMutation.isPending}
          className="h-9 gap-2"
        >
          {shareMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Share2 className="h-4 w-4" />
          )}
          {t('share_email')}
        </Button>
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={() => shareMutation.mutate('workspace')}
        disabled={!targetWorkspaceId || shareMutation.isPending}
        className="h-9"
      >
        {targetWorkspaceName
          ? t('share_workspace_name', { name: targetWorkspaceName })
          : t('share_workspace')}
      </Button>
    </div>
  );
}
