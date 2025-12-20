'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@tuturuuu/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import {
  DOMAIN_BLACKLIST_REGEX,
  EMAIL_BLACKLIST_REGEX,
} from '@tuturuuu/utils/email/validation';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { EmailBlacklistEntry } from './columns';

const FormSchema = z.object({
  entry_type: z.enum(['email', 'domain']),
  value: z
    .string()
    .min(1, 'Value is required')
    .max(255, 'Value must be less than 255 characters')
    .refine(
      (val) => {
        // Basic validation - will be refined based on entry_type
        return val.trim().length > 0;
      },
      {
        message: 'Value cannot be empty',
      }
    ),
  reason: z
    .string()
    .max(500, 'Reason must be less than 500 characters')
    .optional(),
});

type FormValues = z.infer<typeof FormSchema>;

interface Props {
  data?: EmailBlacklistEntry;
  onSuccess?: () => void;
  onError?: (error: string) => void;
  onFinish?: () => void;
}

const QUICK_REASONS = [
  'quick-reason-spam',
  'quick-reason-policy-violation',
  'quick-reason-fraud',
  'quick-reason-inactive',
  'quick-reason-verification-failed',
  'quick-reason-competitor',
] as const;

export default function EmailBlacklistForm({
  data,
  onSuccess,
  onError,
  onFinish,
}: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      entry_type: data?.entry_type || 'email',
      value: data?.value || '',
      reason: data?.reason || '',
    },
  });

  const entryType = form.watch('entry_type');

  // Validate value based on entry type
  const validateValue = (
    value: string,
    type: 'email' | 'domain'
  ): string | null => {
    // Check for empty or whitespace-only values
    if (value.trim() === '') {
      return t('email-blacklist.value-empty');
    }

    if (type === 'email') {
      // Email validation pattern shared with server/API logic
      if (!EMAIL_BLACKLIST_REGEX.test(value)) {
        return t('email-blacklist.invalid-email');
      }
    } else if (type === 'domain') {
      // Domain validation pattern shared with server/API logic
      if (!DOMAIN_BLACKLIST_REGEX.test(value)) {
        return t('email-blacklist.invalid-domain');
      }
    }
    return null;
  };

  async function onSubmit(values: FormValues) {
    // Additional validation
    const validationError = validateValue(values.value, values.entry_type);
    if (validationError) {
      form.setError('value', { message: validationError });
      return;
    }

    setIsLoading(true);

    try {
      const url = data?.id
        ? `/api/v1/infrastructure/email-blacklist/${data.id}`
        : '/api/v1/infrastructure/email-blacklist';

      const method = data?.id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      if (res.ok) {
        toast.success(
          data?.id
            ? t('email-blacklist.entry-updated')
            : t('email-blacklist.entry-created'),
          {
            description: data?.id
              ? t('email-blacklist.entry-updated-description')
              : t('email-blacklist.entry-created-description'),
          }
        );
        form.reset();
        router.refresh();
        onSuccess?.();
        onFinish?.();
      } else {
        const errorData = await res.json();
        const errorMessage =
          errorData.message || t('email-blacklist.operation-failed');
        toast.error(t('email-blacklist.error'), {
          description: errorMessage,
        });
        onError?.(errorMessage);
      }
    } catch (_error) {
      const errorMessage = t('email-blacklist.network-error');
      toast.error(t('email-blacklist.error'), {
        description: errorMessage,
      });
      onError?.(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="entry_type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('email-blacklist.entry-type')}</FormLabel>
              <Select
                onValueChange={field.onChange}
                defaultValue={field.value}
                disabled={!!data?.id || isLoading}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t('email-blacklist.select-entry-type')}
                    />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="email">
                    {t('email-blacklist.email')}
                  </SelectItem>
                  <SelectItem value="domain">
                    {t('email-blacklist.domain')}
                  </SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                {entryType === 'email'
                  ? t('email-blacklist.email-description')
                  : t('email-blacklist.domain-description')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="value"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('email-blacklist.value')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder={
                    entryType === 'email' ? 'user@example.com' : 'example.com'
                  }
                  disabled={!!data?.id || isLoading}
                  type={entryType === 'email' ? 'email' : 'text'}
                />
              </FormControl>
              <FormDescription>
                {entryType === 'email'
                  ? t('email-blacklist.value-email-hint')
                  : t('email-blacklist.value-domain-hint')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('email-blacklist.reason')}</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder={t('email-blacklist.reason-placeholder')}
                  disabled={isLoading}
                  rows={3}
                />
              </FormControl>
              <FormDescription>
                {t('email-blacklist.reason-description')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-3">
          <div className="font-medium text-sm">
            {t('email-blacklist.quick-reasons')}
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_REASONS.map((reason) => (
              <Button
                key={reason}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  form.setValue('reason', t(`email-blacklist.${reason}`), {
                    shouldDirty: true,
                  });
                }}
                disabled={isLoading}
                className="text-xs"
              >
                {t(`email-blacklist.${reason}`)}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={isLoading}>
            {isLoading
              ? t('common.saving')
              : data?.id
                ? t('common.save')
                : t('common.create')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
