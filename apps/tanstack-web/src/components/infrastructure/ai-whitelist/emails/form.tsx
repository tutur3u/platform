'use client';

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

const formSchema = z.object({
  email: z.email(),
});

export const WhitelistEmailFormSchema = formSchema;
export type WhitelistEmailFormValues = z.infer<typeof formSchema>;

interface WhitelistEmailFormProps {
  onFinish?: () => void;
  onSubmit: (values: WhitelistEmailFormValues) => Promise<void> | void;
  wsId: string;
}

export default function WhitelistEmailForm({
  onFinish,
  onSubmit,
}: WhitelistEmailFormProps) {
  const t = useTranslations();

  const form = useForm({
    defaultValues: {
      email: '',
    },
    resolver: zodResolver(formSchema),
  });

  const isDirty = form.formState.isDirty;
  const isValid = form.formState.isValid;
  const isSubmitting = form.formState.isSubmitting;

  const disabled = !isDirty || !isValid || isSubmitting;

  async function handleSubmit(values: WhitelistEmailFormValues) {
    await onSubmit(values);
    form.reset();
    onFinish?.();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-3">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="example@email.com"
                  autoComplete="off"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={disabled}>
          {t('ai-whitelist.add_email')}
        </Button>
      </form>
    </Form>
  );
}
