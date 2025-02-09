'use client';

import RoleFormDisplaySection from './role-display';
import RoleFormMembersSection from './role-members';
import RoleFormPermissionsSection from './role-permissions';
import { ROOT_WORKSPACE_ID } from '@/constants/common';
import { permissionGroups, totalPermissions } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@repo/ui/components/ui/button';
import { Form } from '@repo/ui/components/ui/form';
import { ScrollArea } from '@repo/ui/components/ui/scroll-area';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@repo/ui/components/ui/tabs';
import { toast } from '@repo/ui/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tutur3u/supabase/next/client';
import { SupabaseUser } from '@tutur3u/supabase/next/user';
import { PermissionId, WorkspaceRole } from '@tutur3u/types/db';
import { WorkspaceUser } from '@tutur3u/types/primitives/WorkspaceUser';
import { Monitor, PencilRuler, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

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
  forceDefault?: boolean;
  // eslint-disable-next-line no-unused-vars
  onFinish?: (data: FormType) => void;
}

export interface SectionProps {
  wsId: string;
  user: SupabaseUser | null;
  roleId?: string;
  form: ReturnType<typeof useForm<FormType>>;
  enabledPermissionsCount: { id: string; count: number }[];
}

export function RoleForm({ wsId, user, data, forceDefault, onFinish }: Props) {
  const t = useTranslations();
  const router = useRouter();

  const roleId = data?.id;

  const rootGroups = permissionGroups({ t, wsId: ROOT_WORKSPACE_ID, user });
  const groups = permissionGroups({ t, wsId, user });

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

  const form = useForm<FormType>({
    resolver: zodResolver(FormSchema),
    values: {
      id: forceDefault ? 'DEFAULT' : roleId,
      name: forceDefault ? t('ws-roles.default_permissions') : data?.name || '',
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

  const [loading, setLoading] = useState(false);

  const onSubmit = async (data: FormType) => {
    setLoading(true);

    const res = await fetch(
      forceDefault
        ? `/api/v1/workspaces/${wsId}/roles/default`
        : roleId
          ? `/api/v1/workspaces/${wsId}/roles/${roleId}`
          : `/api/v1/workspaces/${wsId}/roles`,
      {
        method: roleId || forceDefault ? 'PUT' : 'POST',
        body: JSON.stringify({
          ...data,
          permissions: Object.entries(data.permissions).map(
            ([id, enabled]) => ({
              id,
              enabled,
            })
          ),
        }),
      }
    );

    if (res.ok) {
      onFinish?.(data);
      router.refresh();
    } else {
      setLoading(false);
      const data = await res.json();
      toast({
        title: `Failed to ${roleId ? 'edit' : 'create'} role`,
        description: data.message,
      });
    }
  };

  const isEdit = !!roleId;
  const disabled = !isDirty || !isValid || isSubmitting || loading;

  const enabledPermissionsCount = Object.values(groups).map((group) => ({
    id: group.id,
    count: group.permissions.filter((permission) =>
      form.watch(`permissions.${permission.id}`)
    ).length,
  }));

  const sectionProps = { wsId, user, roleId, form, enabledPermissionsCount };
  const [tab, setTab] = useState<'display' | 'permissions' | 'members'>(
    forceDefault ? 'permissions' : 'display'
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        <Tabs
          defaultValue={forceDefault ? 'permissions' : 'display'}
          className="w-full"
          value={tab}
          onValueChange={(value) =>
            setTab(value as 'display' | 'permissions' | 'members')
          }
        >
          <TabsList
            className={cn('grid h-fit w-full grid-cols-1 md:grid-cols-3')}
          >
            <TabsTrigger value="display" disabled={forceDefault}>
              <Monitor className="mr-1 h-5 w-5" />
              {t('ws-roles.display')}
            </TabsTrigger>
            <TabsTrigger value="permissions">
              <PencilRuler className="mr-1 h-5 w-5" />
              {t('ws-roles.permissions')} (
              {enabledPermissionsCount.reduce(
                (acc, group) => acc + group.count,
                0
              )}
              /{totalPermissions({ wsId, user })})
            </TabsTrigger>
            <TabsTrigger value="members" disabled={forceDefault || !isEdit}>
              <Users className="mr-1 h-5 w-5" />
              {t('ws-roles.members')} ({membersCount})
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
            </div>
          </ScrollArea>
        </Tabs>

        <Button type="submit" className="w-full" disabled={disabled}>
          {loading
            ? t('common.processing')
            : isEdit
              ? t('ws-roles.edit')
              : t('ws-roles.create')}
        </Button>
      </form>
    </Form>
  );
}

async function getWorkspaceUsers(wsId: string) {
  const supabase = createClient();

  const queryBuilder = supabase
    .from('workspace_members')
    .select(
      'id:user_id, ...users(display_name, ...user_private_details(email))',
      {
        count: 'exact',
      }
    )
    .eq('ws_id', wsId)
    .order('user_id');

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: WorkspaceUser[]; count: number };
}
