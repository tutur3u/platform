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
import { useTranslations } from 'next-intl';
import * as z from 'zod';
import { isValidURL } from '@/utils/url-helper';

interface Props {
  data: WorkspaceConfig;
  submitLabel?: string;
  resetMode?: boolean;
  onSubmit: (values: z.infer<typeof FormSchema>) => void;
}

const FormSchema = z
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

export const ConfigFormSchema = FormSchema;

export default function ApiKeyForm({
  data,
  submitLabel,
  resetMode,
  onSubmit,
}: Props) {
  const t = useTranslations('ws-reports');

  const form = useForm({
    resolver: zodResolver(FormSchema),
    values: {
      type: data.type || 'TEXT',
      value: data.value || undefined,
    },
  });

  const isDirty = form.formState.isDirty;
  const isValid = form.formState.isValid;
  const isSubmitting = form.formState.isSubmitting;

  const disabled = !resetMode && (!isDirty || !isValid || isSubmitting);

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
                    placeholder="Value"
                    autoComplete="off"
                    maxHeight={200}
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
