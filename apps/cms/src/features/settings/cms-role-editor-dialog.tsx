'use client';

import { useMutation } from '@tanstack/react-query';
import {
  createWorkspaceRole,
  updateWorkspaceDefaultRole,
  updateWorkspaceRole,
  type WorkspaceRoleDetails,
} from '@tuturuuu/internal-api';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { toast } from '@tuturuuu/ui/sonner';
import {
  permissionGroups,
  totalPermissions,
} from '@tuturuuu/utils/permissions';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

type CmsRoleEditorMode = 'create' | 'default' | 'edit';

type CmsRoleEditorDialogProps = {
  currentUserEmail?: string | null;
  initialRole?: WorkspaceRoleDetails | null;
  mode: CmsRoleEditorMode;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  open: boolean;
  workspaceId: string;
};

export function CmsRoleEditorDialog({
  currentUserEmail,
  initialRole,
  mode,
  onOpenChange,
  onSaved,
  open,
  workspaceId,
}: CmsRoleEditorDialogProps) {
  const t = useTranslations();
  const permissionUser = currentUserEmail
    ? ({ email: currentUserEmail } as SupabaseUser)
    : null;
  const groups = permissionGroups({
    t: t as (key: string) => string,
    user: permissionUser,
    wsId: workspaceId,
  });
  const allPermissions = groups.flatMap((group) =>
    group.permissions.map((permission) => permission.id)
  );
  const [name, setName] = useState(
    mode === 'create' ? '' : (initialRole?.name ?? '')
  );
  const [selectedPermissions, setSelectedPermissions] = useState(
    new Set(
      (initialRole?.permissions ?? [])
        .filter((permission) => permission.enabled)
        .map((permission) => permission.id)
    )
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name:
          mode === 'default'
            ? 'DEFAULT'
            : name.trim() || initialRole?.name || '',
        permissions: allPermissions.map((permissionId) => ({
          enabled: selectedPermissions.has(permissionId),
          id: permissionId,
        })),
      };

      if (mode === 'default') {
        return updateWorkspaceDefaultRole(workspaceId, payload);
      }

      if (mode === 'edit' && initialRole?.id) {
        return updateWorkspaceRole(workspaceId, initialRole.id, payload);
      }

      return createWorkspaceRole(workspaceId, payload);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('common.error')),
    onSuccess: () => {
      toast.success(
        mode === 'create' ? t('common.created') : t('common.saved')
      );
      onSaved();
      onOpenChange(false);
    },
  });

  const currentCount = selectedPermissions.size;
  const maxCount = totalPermissions({
    user: permissionUser,
    wsId: workspaceId,
  });
  const disabled =
    saveMutation.isPending || (mode !== 'default' && name.trim().length === 0);

  const title =
    mode === 'create'
      ? t('ws-roles.create')
      : mode === 'default'
        ? t('ws-roles.manage_default_permissions')
        : t('ws-roles.edit');
  const description =
    mode === 'create'
      ? t('ws-roles.create_description')
      : mode === 'default'
        ? t('ws-roles.default_permissions_description')
        : t('ws-roles.edit_description');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {mode !== 'default' ? (
            <div className="grid gap-2">
              <Label htmlFor="cms-role-name">{t('common.name')}</Label>
              <Input
                id="cms-role-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('ws-roles.singular')}
              />
            </div>
          ) : null}

          <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-dynamic-blue/5 px-4 py-3 text-sm">
            <span>{t('ws-roles.permissions')}</span>
            <span className="font-medium">
              {currentCount}/{maxCount}
            </span>
          </div>

          <ScrollArea className="h-[52vh] rounded-2xl border border-border/70">
            <div className="space-y-5 p-4">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className="space-y-3 rounded-2xl border border-border/60 bg-background/70 p-4"
                >
                  <div>
                    <div className="flex items-center gap-2 font-medium">
                      <span className="text-muted-foreground">
                        {group.icon}
                      </span>
                      <span>{group.title}</span>
                    </div>
                    {group.description ? (
                      <p className="mt-1 text-muted-foreground text-sm">
                        {group.description}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-3">
                    {group.permissions.map((permission) => {
                      const checked = selectedPermissions.has(permission.id);

                      return (
                        <label
                          key={permission.id}
                          className="flex items-start gap-3 rounded-xl border border-border/50 bg-background/70 px-3 py-2"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(nextChecked) => {
                              const updated = new Set(selectedPermissions);

                              if (nextChecked) {
                                updated.add(permission.id);
                              } else {
                                updated.delete(permission.id);
                              }

                              setSelectedPermissions(updated);
                            }}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 font-medium text-sm">
                              <span className="text-muted-foreground">
                                {permission.icon}
                              </span>
                              <span>{permission.title}</span>
                            </div>
                            <p className="mt-1 text-muted-foreground text-sm">
                              {permission.description}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="flex justify-end">
            <Button disabled={disabled} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending
                ? t('common.processing')
                : mode === 'create'
                  ? t('ws-roles.create')
                  : t('common.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
