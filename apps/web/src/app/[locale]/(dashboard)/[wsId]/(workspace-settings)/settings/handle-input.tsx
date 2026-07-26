'use client';

import { Check, Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
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
import { workspaceHandleSchema } from '@tuturuuu/utils/workspace-handle';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import * as z from 'zod';

interface Props {
  wsId: string;
  defaultName?: string | null;
  defaultValue?: string | null;
  disabled?: boolean;
}

const FormSchema = z.object({
  handle: workspaceHandleSchema,
});

export default function HandleInput({
  wsId,
  defaultName = '',
  defaultValue = '',
  disabled,
}: Props) {
  const t = useTranslations('ws-settings');

  // Shared hook, not a bare `updateWorkspace` call: the handle shows up in the
  // same cached surfaces as the name.
  const updateWorkspaceMutation = useUpdateWorkspaceIdentity({
    workspaceId: wsId,
  });

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      handle: defaultValue || '',
    },
  });

  const prevDefault = useRef(defaultValue);
  useEffect(() => {
    if (Object.is(prevDefault.current, defaultValue)) return;
    prevDefault.current = defaultValue;
    form.reset({ handle: defaultValue ?? '' });
  }, [defaultValue, form.reset]);

  const { isDirty } = form.formState;
  const saving = updateWorkspaceMutation.isPending;

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    try {
      await updateWorkspaceMutation.mutateAsync({
        handle: data.handle,
        name: defaultName ?? '',
      });
      toast.success(t('handle_updated'), {
        description: t('handle_updated_description'),
      });
      form.reset({ handle: data.handle.toLowerCase() });
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : t('handle_update_error_description');

      toast.error(t('handle_update_error'), {
        description: message,
      });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="handle"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('handle')}</FormLabel>
              <div className="flex min-w-0 items-center gap-2">
                <FormControl className="min-w-0 flex-1">
                  <Input
                    placeholder={t('handle_placeholder')}
                    disabled={disabled}
                    {...field}
                    onChange={(event) => {
                      field.onChange(event.target.value.toLowerCase());
                    }}
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
              <FormDescription className="text-xs">
                {t('handle_description')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}
