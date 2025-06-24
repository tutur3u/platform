'use client';

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
import { Check, Loader2 } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import * as z from 'zod';

interface Props {
  defaultValue?: string | null;
  disabled?: boolean;
}

export default function FullNameInput({ defaultValue = '', disabled }: Props) {
  const t = useTranslations('settings-account');
  const router = useRouter();

  const [saving, setSaving] = useState(false);

  const minLength = 1;
  const maxLength = 50;
  const minLengthError = t('full-name-min-error', { min: minLength });
  const maxLengthError = t('full-name-max-error', { max: maxLength });

  const FormSchema = z.object({
    name: z
      .string()
      .min(1, { message: minLengthError })
      .max(50, { message: maxLengthError })
      .optional(),
  });

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: defaultValue || '',
    },
  });

  const name = form.watch('name');

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    setSaving(true);

    try {
      const res = await fetch('/api/users/me/private', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ full_name: data.name }),
      });
      if (res.ok) {
        toast({
          title: t('profile-updated'),
          description: t('full-name-updated'),
        });
        router.refresh();
      } else {
        const errorData = await res.json().catch(() => ({}));
        toast({
          title: t('error-occurred'),
          description: errorData.message || t('please-try-again'),
        });
      }
    } catch (error) {
      console.error('Network error:', error);
      toast({
        title: t('error-occurred'),
        description:
          error instanceof Error ? error.message : t('please-try-again'),
      });
    }

    setSaving(false);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <div className="flex items-start gap-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormControl>
                  <Input
                    id="full-name"
                    placeholder={t('full-name')}
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
            disabled={name === defaultValue || saving || disabled}
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
