'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
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
import { toast } from '@tuturuuu/ui/sonner';
import {
  permissionGroups,
  totalPermissions,
} from '@tuturuuu/utils/permissions';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type {
  WorkspaceAccessAdapter,
  WorkspaceAccessRole,
  WorkspaceAccessRoleEditorState,
} from './types';
import { WorkspaceAccessPermissionChecklist } from './workspace-access-permission-checklist';
import { getWorkspaceAccessRoleEditorLabels } from './workspace-access-role-editor-labels';

type Props = {
  adapter: WorkspaceAccessAdapter;
  currentUserEmail?: null | string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  state: WorkspaceAccessRoleEditorState;
  workspaceId: string;
};

export function WorkspaceAccessRoleEditorDialog({
  adapter,
  currentUserEmail,
  onOpenChange,
  open,
  state,
  workspaceId,
}: Props) {
  const t = useTranslations() as (key: string) => string;
  const queryClient = useQueryClient();
  const initialRole: WorkspaceAccessRole | null =
    state.mode === 'create' ? null : state.role;
  const permissionUser = currentUserEmail
    ? ({ email: currentUserEmail } as SupabaseUser)
    : null;
  const groups = permissionGroups({
    t: t as (key: string) => string,
    user: permissionUser,
    wsId: workspaceId,
  });
  const allPermissionIds = groups.flatMap((group) =>
    group.permissions.map((permission) => permission.id)
  );
  const [name, setName] = useState(
    state.mode === 'create' ? '' : (initialRole?.name ?? '')
  );
  const [selectedPermissions, setSelectedPermissions] = useState(
    new Set(
      (initialRole?.permissions ?? [])
        .filter((permission) => permission.enabled)
        .map((permission) => permission.id)
    )
  );
  const totalCount = totalPermissions({
    user: permissionUser,
    wsId: workspaceId,
  });
  const selectedCount = selectedPermissions.has('admin')
    ? totalCount
    : selectedPermissions.size;
  const disabled = state.mode !== 'default' && name.trim().length === 0;

  const labels = useMemo(
    () => getWorkspaceAccessRoleEditorLabels(state, t),
    [state, t]
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: state.mode === 'default' ? 'DEFAULT' : name.trim(),
        permissions: allPermissionIds.map((permissionId) => ({
          enabled: selectedPermissions.has(permissionId),
          id: permissionId,
        })),
      };

      if (state.mode === 'default') {
        return adapter.updateDefaultRole(
          workspaceId,
          state.memberType,
          payload
        );
      }

      if (state.mode === 'edit') {
        return adapter.updateRole(workspaceId, state.role.id, payload);
      }

      return adapter.createRole(workspaceId, payload);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('common.error'));
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['workspace-access', workspaceId, 'roles'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['workspace-access', workspaceId, 'defaults'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['workspace-access', workspaceId, 'members'],
        }),
      ]);
      toast.success(
        state.mode === 'create' ? t('common.created') : t('common.saved')
      );
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>{labels.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {state.mode !== 'default' ? (
            <div className="grid gap-2">
              <Label htmlFor="workspace-access-role-name">
                {t('common.name')}
              </Label>
              <Input
                id="workspace-access-role-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('ws-roles.singular')}
              />
            </div>
          ) : null}

          <div className="flex items-center justify-between rounded-lg border bg-muted/35 px-4 py-3 text-sm">
            <span className="font-medium">{t('ws-roles.permissions')}</span>
            <span className="tabular-nums">
              {selectedCount}/{totalCount}
            </span>
          </div>

          <WorkspaceAccessPermissionChecklist
            groups={groups}
            onSelectedPermissionsChange={setSelectedPermissions}
            selectedPermissions={selectedPermissions}
          />

          <div className="flex justify-end">
            <Button
              disabled={disabled || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? t('common.processing') : labels.save}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
