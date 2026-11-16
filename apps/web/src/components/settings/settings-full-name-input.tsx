'use client';

import { useQueryClient } from '@tanstack/react-query';
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
import { MAX_FULL_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import * as z from 'zod';
import { currentUserProfileQueryKey } from '@/hooks/use-current-user-profile';

interface Props {
  defaultValue?: string | null;
  disabled?: boolean;
  placeholder?: string | null;
}

export default function FullNameInput({
  defaultValue = '',
  disabled,
  placeholder,
}: Props) {
  const t = useTranslations('settings-account');
  const commonT = useTranslations('common');
  const queryClient = useQueryClient();
  const router = useRouter();

  const [saving, setSaving] = useState(false);

  const minLength = 1;
  const maxLength = MAX_FULL_NAME_LENGTH;
  const minLengthError = t('full-name-min-error', { min: minLength });
  const maxLengthError = t('full-name-max-error', { max: maxLength });

  const FormSchema = z.object({
    name: z
      .string()
      .trim()
      .min(minLength, { message: minLengthError })
      .max(maxLength, { message: maxLengthError }),
  });

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: defaultValue || '',
    },
  });

  useEffect(() => {
    form.reset({ name: defaultValue || '' });
  }, [defaultValue, form]);

  const name = form.watch('name') ?? '';
  // Compare against the form baseline (updated by reset after a save), not
  // the prop, so the button disables immediately after a successful save.
  const savedName = form.formState.defaultValues?.name ?? '';
  const hasChanges = name.trim() !== savedName.trim();
  const canSave = hasChanges && name.trim().length > 0;

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    if (!canSave) return;
    setSaving(true);

    try {
      const res = await fetch('/api/v1/users/me/full-name', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ full_name: data.name }),
      });
      if (res.ok) {
        await queryClient.invalidateQueries({
          queryKey: [...currentUserProfileQueryKey],
        });
        toast({
          title: t('profile-updated'),
          description: t('full-name-updated'),
        });
        // Reset with the saved value so the button returns to disabled.
        form.reset({ name: data.name });
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
    } finally {
      setSaving(false);
    }
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
                    placeholder={placeholder || t('full-name')}
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
            variant="outline"
            aria-label={commonT('save')}
            disabled={!canSave || saving || disabled}
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
