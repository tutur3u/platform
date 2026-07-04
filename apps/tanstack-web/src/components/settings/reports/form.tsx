'use client';

import type { WorkspaceConfig } from '@tuturuuu/types/primitives/WorkspaceConfig';
import { Button } from '@tuturuuu/ui/button';
import { AutosizeTextarea } from '@tuturuuu/ui/custom/autosize-textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { useTranslations } from 'use-intl';
import * as z from 'zod';

interface Props {
  data: WorkspaceConfig;
  onSubmit: (values: ConfigFormValues) => void;
  resetMode?: boolean;
  submitLabel?: string;
}

const isValidURL = (url: string): boolean => {
  if (!url) return false;

  try {
    const parsedUrl = new URL(url);
    return ['http:', 'https:', 'ftp:', 'mailto:', 'tel:', 'file:'].includes(
      parsedUrl.protocol
    );
  } catch {
    return false;
  }
};

const ConfigFormSchema = z
  .object({
    type: z.string(),
    value: z.string().optional(),
  })
  .refine(
    (data) => data.type !== 'URL' || !data.value || isValidURL(data.value),
    {
      message: 'Invalid URL',
    }
  );

export type ConfigFormValues = z.infer<typeof ConfigFormSchema>;

export default function ConfigForm({
  data,
  onSubmit,
  resetMode,
  submitLabel,
}: Props) {
  const t = useTranslations('ws-reports');

  const form = useForm({
    resolver: zodResolver(ConfigFormSchema),
    values: {
      type: data.type || 'TEXT',
      value: data.value || undefined,
    },
  });

  const disabled =
    !resetMode &&
    (!form.formState.isDirty ||
      !form.formState.isValid ||
      form.formState.isSubmitting);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        {resetMode || (
          <FormField
            control={form.control}
            name="value"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('value')}</FormLabel>
                <FormControl>
                  <AutosizeTextarea
                    autoComplete="off"
                    maxHeight={200}
                    placeholder="Value"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <Button type="submit" className="w-full" disabled={disabled}>
          {submitLabel}
        </Button>
      </form>
    </Form>
  );
}
