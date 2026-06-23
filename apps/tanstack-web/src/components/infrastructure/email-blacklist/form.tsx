'use client';

import type {
  BackendInfrastructureEmailBlacklistEntry,
  BackendInfrastructureEmailBlacklistEntryType,
} from '@tuturuuu/internal-api/backend';
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
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Textarea } from '@tuturuuu/ui/textarea';
import {
  DOMAIN_BLACKLIST_REGEX,
  EMAIL_BLACKLIST_REGEX,
} from '@tuturuuu/utils/email/validation';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { EmailBlacklistQuickReasons } from './quick-reasons';

export type EmailBlacklistCreateValues = {
  entry_type: BackendInfrastructureEmailBlacklistEntryType;
  reason?: string | null;
  value: string;
};

export type EmailBlacklistUpdateValues = {
  reason?: string | null;
};

const formSchema = z.object({
  entry_type: z.enum(['email', 'domain']),
  reason: z.string().optional(),
  value: z.string(),
});

type EmailBlacklistFormValues = z.infer<typeof formSchema>;

type EmailBlacklistFormProps = {
  data?: BackendInfrastructureEmailBlacklistEntry;
  forceDefault?: boolean;
  isPending?: boolean;
  onCreate?: (values: EmailBlacklistCreateValues) => Promise<void> | void;
  onFinish?: () => void;
  onUpdate?: (
    entryId: string,
    values: EmailBlacklistUpdateValues
  ) => Promise<void> | void;
};

function getDefaultValues(
  data?: BackendInfrastructureEmailBlacklistEntry
): EmailBlacklistFormValues {
  return {
    entry_type: data?.entry_type ?? 'email',
    reason: data?.reason ?? '',
    value: data?.value ?? '',
  };
}

function normalizeReason(reason?: string) {
  const normalized = reason?.trim();

  return normalized ? normalized : null;
}

export default function EmailBlacklistForm({
  data,
  isPending,
  onCreate,
  onFinish,
  onUpdate,
}: EmailBlacklistFormProps) {
  const t = useTranslations();
  const isEditing = Boolean(data?.id);
  const form = useForm<EmailBlacklistFormValues>({
    defaultValues: getDefaultValues(data),
    resolver: zodResolver(formSchema),
  });
  const entryType = form.watch('entry_type');
  const disabled =
    isPending || form.formState.isSubmitting || !form.formState.isDirty;

  function validateValue(
    value: string,
    type: BackendInfrastructureEmailBlacklistEntryType
  ) {
    const normalizedValue = value.trim();

    if (!normalizedValue) {
      return t('email-blacklist.value-empty');
    }

    if (type === 'email' && !EMAIL_BLACKLIST_REGEX.test(normalizedValue)) {
      return t('email-blacklist.invalid-email');
    }

    if (type === 'domain' && !DOMAIN_BLACKLIST_REGEX.test(normalizedValue)) {
      return t('email-blacklist.invalid-domain');
    }

    return null;
  }

  async function handleSubmit(values: EmailBlacklistFormValues) {
    const validationError = isEditing
      ? null
      : validateValue(values.value, values.entry_type);

    if (validationError) {
      form.setError('value', { message: validationError });
      return;
    }

    try {
      if (isEditing && data?.id) {
        await onUpdate?.(data.id, {
          reason: normalizeReason(values.reason),
        });
      } else {
        await onCreate?.({
          entry_type: values.entry_type,
          reason: normalizeReason(values.reason),
          value: values.value.trim(),
        });
      }

      form.reset(getDefaultValues(data));
      onFinish?.();
    } catch {
      // Mutation handlers own localized toast/error reporting.
    }
  }

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={form.handleSubmit(handleSubmit)}>
        <FormField
          control={form.control}
          name="entry_type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('email-blacklist.entry-type')}</FormLabel>
              <Select
                defaultValue={field.value}
                disabled={isEditing || isPending || form.formState.isSubmitting}
                onValueChange={field.onChange}
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
                  autoComplete="off"
                  disabled={
                    isEditing || isPending || form.formState.isSubmitting
                  }
                  placeholder={
                    entryType === 'email' ? 'user@example.com' : 'example.com'
                  }
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
                  disabled={isPending || form.formState.isSubmitting}
                  placeholder={t('email-blacklist.reason-placeholder')}
                  rows={3}
                  value={field.value ?? ''}
                />
              </FormControl>
              <FormDescription>
                {t('email-blacklist.reason-description')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <EmailBlacklistQuickReasons
          disabled={isPending || form.formState.isSubmitting}
          onSelect={(reason) => {
            form.setValue('reason', reason, {
              shouldDirty: true,
            });
          }}
        />

        <div className="flex justify-end gap-2">
          <Button disabled={disabled} type="submit">
            {isPending || form.formState.isSubmitting
              ? t('common.saving')
              : isEditing
                ? t('common.save')
                : t('common.create')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
