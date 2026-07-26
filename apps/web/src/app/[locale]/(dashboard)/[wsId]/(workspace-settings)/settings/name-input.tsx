'use client';

import { Check, Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { useUpdateWorkspaceIdentity } from '@tuturuuu/ui/hooks/use-workspace-identity-mutation';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import * as z from 'zod';

interface Props {
  wsId: string;
  defaultValue?: string | null;
  disabled?: boolean;
}

const FormSchema = z.object({
  name: z.string().min(1).max(50).optional(),
});

export default function NameInput({
  wsId,
  defaultValue = '',
  disabled,
}: Props) {
  const t = useTranslations('ws-settings');

  // Shared hook, not a bare `updateWorkspace` call: renaming has to reach the
  // client caches the workspace selector reads from, not just the server tree.
  const updateWorkspaceMutation = useUpdateWorkspaceIdentity({
    workspaceId: wsId,
  });

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: defaultValue || '',
    },
  });

  const prevDefault = useRef(defaultValue);
  useEffect(() => {
    if (Object.is(prevDefault.current, defaultValue)) return;
    prevDefault.current = defaultValue;
    form.reset({ name: defaultValue ?? '' });
  }, [defaultValue, form.reset]);

  const { isDirty } = form.formState;
  const saving = updateWorkspaceMutation.isPending;

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    try {
      await updateWorkspaceMutation.mutateAsync({ name: data.name ?? '' });
      toast.success(t('name_updated'), {
        description: t('name_updated_description'),
      });

      form.reset({ name: data.name });
    } catch {
      toast.error(t('name_update_error'), {
        description: t('name_update_error_description'),
      });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('name')}</FormLabel>
              <div className="flex min-w-0 items-center gap-2">
                <FormControl className="min-w-0 flex-1">
                  <Input
                    placeholder={t('name_placeholder')}
                    disabled={disabled}
                    {...field}
                  />
                </FormControl>
                <Button
                  type="submit"
                  size="icon"
                  className="shrink-0"
                  disabled={!isDirty || saving || disabled}
                >
                  {saving ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Check className="h-5 w-5" />
                  )}
                </Button>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}
