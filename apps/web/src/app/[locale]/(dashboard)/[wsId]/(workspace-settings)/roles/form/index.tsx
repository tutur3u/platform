'use client';

import { permissionGroups } from './permissions';
import RoleFormDisplaySection from './role-display';
import RoleFormMembersSection from './role-members';
import RoleFormPermissionsSection from './role-permissions';
import { PermissionId, WorkspaceRole } from '@/types/db';
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
    permissionGroups((key: string) => key).reduce(
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
  data?: WorkspaceRole;
  onFinish?: (data: FormType) => void;
}

export interface SectionProps {
  form: ReturnType<typeof useForm<FormType>>;
  enabledPermissionsCount: { id: string; count: number }[];
}

export function RoleForm({ wsId, data, onFinish }: Props) {
  const t = useTranslations();
  const router = useRouter();

  const groups = permissionGroups(t);

  const form = useForm<FormType>({
    resolver: zodResolver(FormSchema),
    values: {
      id: data?.id,
      name: data?.name || '',
      permissions: groups.reduce(
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
      data?.id
        ? `/api/v1/workspaces/${wsId}/roles/${data.id}`
        : `/api/v1/workspaces/${wsId}/roles`,
      {
        method: data.id ? 'PUT' : 'POST',
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
        title: `Failed to ${data.id ? 'edit' : 'create'} role`,
        description: data.message,
      });
    }
  };

  const isEdit = !!data?.id;
  const disabled = !isDirty || !isValid || isSubmitting || loading;

  const enabledPermissionsCount = Object.values(groups).map((group) => ({
    id: group.id,
    count: group.permissions.filter((permission) =>
      form.watch(`permissions.${permission.id}`)
    ).length,
  }));

  const sectionProps = { form, enabledPermissionsCount };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        <Tabs defaultValue="display" className="w-full">
          <TabsList className="grid h-fit w-full grid-cols-1 md:grid-cols-3">
            <TabsTrigger value="display">
              <Monitor className="mr-1 h-5 w-5" />
              {t('ws-roles.display')}
            </TabsTrigger>
            <TabsTrigger
              value="permissions"
              disabled={!data?.id && form.watch('name') === ''}
            >
              <PencilRuler className="mr-1 h-5 w-5" />
              {t('ws-roles.permissions')} (
              {enabledPermissionsCount.reduce(
                (acc, group) => acc + group.count,
                0
              )}
              /
              {groups.reduce((acc, group) => acc + group.permissions.length, 0)}
              )
            </TabsTrigger>
            <TabsTrigger
              value="members"
              disabled={!data?.id && form.watch('name') === ''}
            >
              <Users className="mr-1 h-5 w-5" />
              {t('ws-roles.members')} (0)
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[70vh] pb-4">
            <TabsContent value="display">
              <RoleFormDisplaySection {...sectionProps} />
            </TabsContent>
            <TabsContent value="permissions">
              <RoleFormPermissionsSection {...sectionProps} />
            </TabsContent>
            <TabsContent value="members">
              <RoleFormMembersSection {...sectionProps} />
            </TabsContent>
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
