import { Props } from './index';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@repo/ui/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@repo/ui/components/ui/form';
import { Input } from '@repo/ui/components/ui/input';
import { toast } from '@repo/ui/hooks/use-toast';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

const FormSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
});

export const RoleFormSchema = FormSchema;

export default function RoleFormDisplaySection({
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
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('ws-roles.name')}</FormLabel>
              <FormControl>
                <Input placeholder="Name" autoComplete="off" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={disabled || loading}>
          {loading
            ? t('common.processing')
            : data?.id
              ? t('ws-roles.edit')
              : t('ws-roles.create')}
        </Button>
      </form>
    </Form>
  );
}
