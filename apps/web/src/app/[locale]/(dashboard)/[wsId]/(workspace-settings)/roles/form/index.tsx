'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Monitor, PencilRuler, Users } from '@tuturuuu/icons';
import {
  createWorkspaceRole,
  updateWorkspaceDefaultPermissions,
  updateWorkspaceRole,
} from '@tuturuuu/internal-api/settings';
import { listWorkspaceMembers } from '@tuturuuu/internal-api/workspaces';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type {
  PermissionId,
  WorkspaceDefaultPermissionMemberType,
  WorkspaceRole,
} from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Button } from '@tuturuuu/ui/button';
import { Form } from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { cn } from '@tuturuuu/utils/format';
import {
  type PermissionCatalog,
  permissionGroups,
  totalPermissions,
} from '@tuturuuu/utils/permissions';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import * as z from 'zod';
import RoleFormDisplaySection from './role-display';
import RoleFormMembersSection from './role-members';
import RoleFormPermissionsSection from './role-permissions';
import RoleFormWalletAccessSection from './role-wallet-access';

const FormSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  permissions: z.object(
    permissionGroups({
      wsId: ROOT_WORKSPACE_ID,
      user: {
        id: 'default',
        email: 'contact@tuturuuu.com',
        app_metadata: {},
        user_metadata: {},
        aud: '',
        created_at: '',
      },
    }).reduce(
      (acc, group) => {
        group.permissions.forEach((permission) => {
          acc[permission.id] = z.boolean();
        });
        return acc;
      },
      {} as Record<PermissionId, z.ZodBoolean>
    )
  ),
});

type FormType = z.infer<typeof FormSchema>;

interface Props {
  wsId: string;
  user: SupabaseUser | null;
  data?: WorkspaceRole;
  defaultMemberType?: WorkspaceDefaultPermissionMemberType;
  defaultName?: string;
  forceDefault?: boolean;
  permissionCatalog?: PermissionCatalog;

  onFinish?: (data: FormType) => void;
}

export interface SectionProps {
  wsId: string;
  user: SupabaseUser | null;
  roleId?: string;
  initialMembers?: WorkspaceUser[];
  initialMembersCount?: number;
  permissionCatalog: PermissionCatalog;
  form: ReturnType<typeof useForm<FormType>>;
  enabledPermissionsCount: { id: string; count: number }[];
}

export function RoleForm({
  wsId,
  user,
  data,
  defaultMemberType = 'MEMBER',
  defaultName,
  forceDefault,
  permissionCatalog = forceDefault ? 'full' : 'workspace',
  onFinish,
}: Props) {
  const t = useTranslations();
  const queryClient = useQueryClient();

  const roleId = data?.id;

  const rootGroups = permissionGroups({
    catalog: 'full',
    t: t as (key: string) => string,
    wsId,
    user,
  });

  const groups = permissionGroups({
    catalog: permissionCatalog,
    t: t as (key: string) => string,
    wsId,
    user,
  });

  const workspaceMembersQuery = useQuery({
    queryKey: ['workspaces', wsId, 'members'],
    queryFn: () => getWorkspaceUsers(wsId),
    enabled: forceDefault,
  });

  const [roleMembersCount, setRoleMembersCount] = useState(
    data?.user_count ?? 0
  );

  const membersCount = forceDefault
    ? workspaceMembersQuery.data?.count
    : roleMembersCount;

  const form = useForm({
    resolver: zodResolver(FormSchema),
    values: {
      id: forceDefault ? 'DEFAULT' : roleId,
      name: forceDefault
        ? (defaultName ?? t('ws-roles.default_permissions'))
        : data?.name || '',
      permissions: rootGroups.reduce(
        (acc, group) => {
          group.permissions.forEach((permission) => {
            acc[permission.id] =
              data?.permissions.some(
                (p) => p.id === permission.id && p.enabled
              ) || false;
          });
          return acc;
        },
        {} as Record<PermissionId, boolean>
      ),
    },
  });

  const isDirty = form.formState.isDirty;
  const isValid = form.formState.isValid;
  const isSubmitting = form.formState.isSubmitting;

  const mutation = useMutation({
    mutationFn: async (formData: FormType) => {
      const payload = {
        ...formData,
        permissions: Object.entries(formData.permissions).map(
          ([id, enabled]) => ({
            id: id as PermissionId,
            enabled,
          })
        ),
      };

      if (forceDefault) {
        return updateWorkspaceDefaultPermissions(wsId, defaultMemberType, {
          permissions: payload.permissions,
        });
      }

      if (roleId) {
        return updateWorkspaceRole(wsId, roleId, payload);
      }

      return createWorkspaceRole(wsId, payload);
    },
    onSuccess: async (_result, formData) => {
      onFinish?.(formData);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['workspace-roles', wsId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['workspace-default-permissions', wsId],
        }),
      ]);
      form.reset(formData);
    },
    onError: (error) => {
      toast({
        title: t('ws-roles.save_failed'),
        description:
          error instanceof Error ? error.message : t('common.500-msg'),
      });
    },
  });

  const onSubmit = (data: FormType) => {
    mutation.mutate(data);
  };

  const isEdit = !!roleId;
  const disabled = !isDirty || !isValid || isSubmitting || mutation.isPending;

  const enabledPermissionsCount = Object.values(groups).map((group) => ({
    id: group.id,
    count: group.permissions.filter((permission) =>
      form.watch(`permissions.${permission.id}`)
    ).length,
  }));

  const adminEnabled = form.watch('permissions.admin');
  const totalCount = totalPermissions({
    catalog: permissionCatalog,
    wsId,
    user,
  });

  const currentCount = adminEnabled
    ? totalCount
    : enabledPermissionsCount.reduce((acc, group) => acc + group.count, 0);

  const sectionProps = {
    wsId,
    user,
    roleId,
    initialMembers: data?.members as WorkspaceUser[] | undefined,
    initialMembersCount: data?.user_count,
    permissionCatalog,
    form,
    enabledPermissionsCount,
  };
  const [tab, setTab] = useState<
    'display' | 'permissions' | 'members' | 'wallets'
  >(forceDefault ? 'permissions' : 'display');

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        <Tabs
          defaultValue={forceDefault ? 'permissions' : 'display'}
          className="w-full"
          value={tab}
          onValueChange={(value) =>
            setTab(value as 'display' | 'permissions' | 'members' | 'wallets')
          }
        >
          <TabsList
            className={cn('grid h-fit w-full grid-cols-1 md:grid-cols-4')}
          >
            <TabsTrigger value="display" disabled={forceDefault}>
              <Monitor className="mr-1 h-5 w-5" />
              {t('ws-roles.display')}
            </TabsTrigger>
            <TabsTrigger value="permissions">
              <PencilRuler className="mr-1 h-5 w-5" />
              {t('ws-roles.permissions')} ({currentCount}/{totalCount})
            </TabsTrigger>
            <TabsTrigger value="members" disabled={forceDefault || !isEdit}>
              <Users className="mr-1 h-5 w-5" />
              {t('ws-roles.members')} ({membersCount})
            </TabsTrigger>
            <TabsTrigger value="wallets" disabled={forceDefault || !isEdit}>
              <Banknote className="mr-1 h-5 w-5" />
              {t('ws-roles.wallet_access')}
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[50vh] border-b md:h-[60vh]">
            <div className="mb-4">
              <TabsContent value="display">
                <RoleFormDisplaySection {...sectionProps} />
              </TabsContent>
              <TabsContent value="permissions">
                <RoleFormPermissionsSection {...sectionProps} />
              </TabsContent>
              <TabsContent value="members">
                <RoleFormMembersSection
                  {...sectionProps}
                  onUpdate={setRoleMembersCount}
                />
              </TabsContent>
              <TabsContent value="wallets">
                <RoleFormWalletAccessSection {...sectionProps} />
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>

        <Button type="submit" className="w-full" disabled={disabled}>
          {mutation.isPending
            ? t('common.processing')
            : forceDefault
              ? t('common.save')
              : isEdit
                ? t('ws-roles.edit')
                : t('ws-roles.create')}
        </Button>
      </form>
    </Form>
  );
}

async function getWorkspaceUsers(wsId: string) {
  const data = (await listWorkspaceMembers(wsId)) as WorkspaceUser[];
  return { data, count: data.length };
}
