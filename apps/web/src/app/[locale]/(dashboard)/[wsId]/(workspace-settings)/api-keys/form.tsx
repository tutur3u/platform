import { WorkspaceApiKey } from '@tuturuuu/types/primitives/WorkspaceApiKey';
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
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { useTranslations } from 'next-intl';
import * as z from 'zod';

interface Props {
  data: WorkspaceApiKey;
  submitLabel?: string;
  onSubmit: (values: z.infer<typeof FormSchema>) => void;
}

const FormSchema = z.object({
  name: z.string().min(1),
  value: z.string().optional(),
});

export const ApiConfigFormSchema = FormSchema;

export default function ApiKeyForm({ data, submitLabel, onSubmit }: Props) {
  const t = useTranslations('ws-api-keys');

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    values: {
      name: data.name || '',
      value: data.value || undefined,
    },
  });

  const isDirty = form.formState.isDirty;
  const isValid = form.formState.isValid;
  const isSubmitting = form.formState.isSubmitting;

  const disabled = !isDirty || !isValid || isSubmitting;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('name')}</FormLabel>
              <FormControl>
                <Input placeholder="Name" autoComplete="off" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {data?.value && (
          <FormField
            control={form.control}
            name="value"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('value')}</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Value"
                    autoComplete="off"
                    {...field}
                    disabled
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
