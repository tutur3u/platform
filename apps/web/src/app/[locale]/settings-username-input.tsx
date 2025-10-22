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
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import * as z from 'zod';

interface Props {
  defaultValue?: string | null;
  disabled?: boolean;
}

const FormSchema = z.object({
  username: z
    .string()
    .min(3, { message: 'Username must be at least 3 characters' })
    .max(30, { message: 'Username must be at most 30 characters' })
    .regex(/^[a-zA-Z0-9_-]+$/, {
      message:
        'Username can only contain letters, numbers, hyphens, and underscores',
    })
    .optional(),
});

export default function UsernameInput({ defaultValue = '', disabled }: Props) {
  const t = useTranslations('settings-account');
  const router = useRouter();

  const [saving, setSaving] = useState(false);

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      username: defaultValue || '',
    },
  });

  const username = form.watch('username');
  const hasChanges = username !== defaultValue;

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    setSaving(true);

    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ handle: data.username }),
      });

      if (res.ok) {
        toast({
          title: t('profile-updated'),
          description: t('username-updated'),
        });

        router.refresh();
      } else {
        const errorData = await res.json().catch(() => ({}));

        // Check for duplicate handle error
        if (
          errorData.message?.includes('already taken') ||
          errorData.message?.includes('Handle already taken')
        ) {
          toast({
            title: t('error-occurred'),
            description: t('username-taken'),
            variant: 'destructive',
          });
        } else {
          toast({
            title: t('error-occurred'),
            description: errorData.message || t('please-try-again'),
            variant: 'destructive',
          });
        }
      }
    } catch (error) {
      console.error('Network error:', error);
      toast({
        title: t('error-occurred'),
        description:
          error instanceof Error ? error.message : t('please-try-again'),
        variant: 'destructive',
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
            name="username"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormControl>
                  <Input
                    id="username"
                    placeholder={t('username')}
                    disabled={disabled}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {hasChanges && (
            <Button
              type="submit"
              size="icon"
              onClick={form.handleSubmit(onSubmit)}
              disabled={saving || disabled}
              className="shrink-0"
            >
              {saving ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Check className="h-5 w-5" />
              )}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
