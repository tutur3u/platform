'use client';

import { Check, Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import * as z from 'zod';

interface Props {
  defaultValue?: string | null;
  disabled?: boolean;
}

const FormSchema = z.object({
  name: z.string().min(0).max(50).optional(),
});

export default function DisplayNameInput({
  defaultValue = '',
  disabled,
}: Props) {
  const t = useTranslations('settings-account');
  const router = useRouter();

  const [saving, setSaving] = useState(false);

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: defaultValue || '',
    },
  });

  useEffect(() => {
    form.reset({ name: defaultValue || '' });
  }, [defaultValue, form]);

  const { isDirty } = form.formState;

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    setSaving(true);

    const res = await fetch('/api/v1/users/me/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ display_name: data.name }),
    });

    if (res.ok) {
      toast({
        title: 'Profile updated',
        description: 'Your display name has been updated.',
      });

      router.refresh();
      // Reset form with new value to reset isDirty
      form.reset({ name: data.name });
    } else {
      toast({
        title: 'An error occurred',
        description: 'Please try again.',
      });
    }

    setSaving(false);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <div className="flex items-center gap-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormControl>
                  <Input
                    id="display-name"
                    placeholder={t('display-name')}
                    disabled={disabled}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            size="icon"
            disabled={!isDirty || saving || disabled}
            className="shrink-0"
          >
            {saving ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Check className="h-5 w-5" />
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
