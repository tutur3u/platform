import { Props } from './index';
import { permissionGroups } from './permissions';
import RolePermission from './role-permission';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@repo/ui/components/ui/accordion';
import { Button } from '@repo/ui/components/ui/button';
import { ScrollArea } from '@repo/ui/components/ui/scroll-area';
import { Separator } from '@repo/ui/components/ui/separator';
import { toast } from '@repo/ui/hooks/use-toast';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Fragment, useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

const FormSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
});

export const RoleFormSchema = FormSchema;

export default function RoleFormPermissionsSection({
  wsId,
  data,
  onFinish,
}: Props) {
  const t = useTranslations();
  const router = useRouter();

  const [loading, setLoading] = useState(false);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    values: {
      id: data?.id,
      name: data?.name || '',
    },
  });

  const isDirty = form.formState.isDirty;
  const isValid = form.formState.isValid;
  const isSubmitting = form.formState.isSubmitting;

  const disabled = !isDirty || !isValid || isSubmitting;

  const onSubmit = async (data: z.infer<typeof RoleFormSchema>) => {
    setLoading(true);

    const res = await fetch(
      data?.id
        ? `/api/v1/workspaces/${wsId}/roles/${data.id}`
        : `/api/v1/workspaces/${wsId}/roles`,
      {
        method: data.id ? 'PUT' : 'POST',
        body: JSON.stringify(data),
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

  return (
    <>
      <ScrollArea className="h-[70vh] pb-4">
        <Accordion type="multiple">
          {permissionGroups.map((group, idx) => (
            <Fragment key={`group-${group.id}`}>
              <AccordionItem value={`group-${group.id}`}>
                <AccordionTrigger>
                  {group.title} (0/{group.permissions.length})
                </AccordionTrigger>
                <AccordionContent>
                  {group.permissions.map((permission, idx) => (
                    <Fragment
                      key={`group-${group.id}-permission-${permission.id}`}
                    >
                      <RolePermission
                        title={permission.title}
                        description={permission.description}
                        // value={data?.permissions.includes(permission.id)}
                        // onChange={(value) => {
                        //   form.setValue(
                        //     'permissions',
                        //     value
                        //       ? [...data?.permissions, permission.id]
                        //       : data?.permissions.filter((id) => id !== permission.id)
                        //   );
                        // }}
                        disabled={permission.disabled}
                      />
                      {idx !== group.permissions.length - 1 && (
                        <Separator className="my-4" />
                      )}
                    </Fragment>
                  ))}
                </AccordionContent>
              </AccordionItem>
              {idx !== permissionGroups.length - 1 && <div className="mb-2" />}
            </Fragment>
          ))}
        </Accordion>
      </ScrollArea>

      <Button
        type="submit"
        className="w-full"
        disabled={disabled || loading}
        onClick={form.handleSubmit(onSubmit)}
      >
        {loading
          ? t('common.processing')
          : data?.id
            ? t('ws-roles.edit')
            : t('ws-roles.create')}
      </Button>
    </>
  );
}
