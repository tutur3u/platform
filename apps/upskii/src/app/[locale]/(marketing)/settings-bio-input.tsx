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
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import * as z from 'zod';

interface Props {
  defaultValue?: string | null;
  disabled?: boolean;
}

const minLength = 10;
const maxLength = 100;

export default function BioInput({ defaultValue = '', disabled }: Props) {
  const t = useTranslations('settings-account');
  const router = useRouter();

  const [saving, setSaving] = useState(false);

  function createFormSchema(t: ReturnType<typeof useTranslations>) {
    return z.object({
      bio: z
        .string()
        .refine(
          (value) => value.split(/\s+/).filter(Boolean).length >= minLength,
          { message: t('bio-min-length', { min: minLength }) }
        )
        .refine(
          (value) => value.split(/\s+/).filter(Boolean).length <= maxLength,
          { message: t('bio-max-length', { max: maxLength }) }
        )
        .optional(),
    });
  }

  const FormSchema = createFormSchema(t);

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      bio: defaultValue || '',
    },
  });

  const name = form.watch('bio');

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    setSaving(true);

    const res = await fetch('/api/users/me', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bio: data.bio }),
    });

    if (res.ok) {
      toast({
        title: 'Bio updated',
        description: 'Your biography has been updated.',
      });

      router.refresh();
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
        <div className="flex items-start gap-2">
          <FormField
            control={form.control}
            name="bio"
            render={({ field }) => (
              <FormItem className="w-full md:min-w-max md:max-w-lg">
                <FormControl>
                  <Textarea
                    className="field-sizing-fixed resize-none"
                    rows={3}
                    id="bio"
                    placeholder={t('bio')}
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
            onClick={form.handleSubmit(onSubmit)}
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
