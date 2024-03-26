import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { WorkspaceUserField } from '@/types/primitives/WorkspaceUserField';
import { Button } from '@/components/ui/button';
import useTranslation from 'next-translate/useTranslation';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Props {
  data: WorkspaceUserField;
  submitLabel?: string;
  onSubmit: (values: z.infer<typeof FormSchema>) => void;
}

const FormSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.string(),
  possible_values: z.array(z.string()).optional(),
  default_value: z.string().optional(),
  notes: z.string().optional(),
});

export const ApiConfigFormSchema = FormSchema;

export default function UserFieldForm({ data, submitLabel, onSubmit }: Props) {
  const { t } = useTranslation('ws-user-fields');

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    values: {
      name: data.name || '',
      description: data.description,
      type: data.type || '',
      possible_values: data.possible_values,
      default_value: data.default_value,
      notes: data.notes,
    },
  });

  const isDirty = form.formState.isDirty;
  const isValid = form.formState.isValid;
  const isSubmitting = form.formState.isSubmitting;

  const disabled = !isDirty || !isValid || isSubmitting;

  return (
    <Form {...form}>
      <ScrollArea className="group h-96 w-full">
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-3 p-4 pt-0 transition-all"
        >
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('name')}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t('name')}
                    autoComplete="off"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('description')}</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder={t('description')}
                    autoComplete="off"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('type')}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t('type')}
                    autoComplete="off"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="possible_values"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('possible_values')}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t('possible_values')}
                    autoComplete="off"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="default_value"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('default_value')}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t('default_value')}
                    autoComplete="off"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('notes')}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t('notes')}
                    autoComplete="off"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" disabled={disabled}>
            {submitLabel}
          </Button>
        </form>
      </ScrollArea>
    </Form>
  );
}
