'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
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
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { MobileVersionPolicies } from '@/lib/mobile-version-policy';

const VERSION_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

type FormValues = {
  ios: {
    effectiveVersion: string;
    minimumVersion: string;
    storeUrl: string;
  };
  android: {
    effectiveVersion: string;
    minimumVersion: string;
    storeUrl: string;
  };
};

interface Props {
  initialData: MobileVersionPolicies;
}

function toFormValues(data: MobileVersionPolicies): FormValues {
  return {
    ios: {
      effectiveVersion: data.ios.effectiveVersion ?? '',
      minimumVersion: data.ios.minimumVersion ?? '',
      storeUrl: data.ios.storeUrl ?? '',
    },
    android: {
      effectiveVersion: data.android.effectiveVersion ?? '',
      minimumVersion: data.android.minimumVersion ?? '',
      storeUrl: data.android.storeUrl ?? '',
    },
  };
}

export function MobileVersionSettingsForm({ initialData }: Props) {
  const router = useRouter();
  const t = useTranslations('mobile-version-settings');
  const formSchema = z.object({
    ios: z
      .object({
        effectiveVersion: z.string(),
        minimumVersion: z.string(),
        storeUrl: z.string(),
      })
      .superRefine((value, ctx) => {
        const effectiveVersion = value.effectiveVersion.trim();
        const minimumVersion = value.minimumVersion.trim();
        const storeUrl = value.storeUrl.trim();
        const hasThreshold =
          effectiveVersion.length > 0 || minimumVersion.length > 0;

        if (
          effectiveVersion.length > 0 &&
          !VERSION_REGEX.test(effectiveVersion)
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['effectiveVersion'],
            message: t('validation.version_format'),
          });
        }

        if (minimumVersion.length > 0 && !VERSION_REGEX.test(minimumVersion)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['minimumVersion'],
            message: t('validation.version_format'),
          });
        }

        if (hasThreshold && storeUrl.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['storeUrl'],
            message: t('validation.store_url_required'),
          });
        }
      }),
    android: z
      .object({
        effectiveVersion: z.string(),
        minimumVersion: z.string(),
        storeUrl: z.string(),
      })
      .superRefine((value, ctx) => {
        const effectiveVersion = value.effectiveVersion.trim();
        const minimumVersion = value.minimumVersion.trim();
        const storeUrl = value.storeUrl.trim();
        const hasThreshold =
          effectiveVersion.length > 0 || minimumVersion.length > 0;

        if (
          effectiveVersion.length > 0 &&
          !VERSION_REGEX.test(effectiveVersion)
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['effectiveVersion'],
            message: t('validation.version_format'),
          });
        }

        if (minimumVersion.length > 0 && !VERSION_REGEX.test(minimumVersion)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['minimumVersion'],
            message: t('validation.version_format'),
          });
        }

        if (hasThreshold && storeUrl.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['storeUrl'],
            message: t('validation.store_url_required'),
          });
        }
      }),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(initialData),
  });

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const response = await fetch('/api/v1/infrastructure/mobile-versions', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ios: {
            effectiveVersion: values.ios.effectiveVersion.trim() || null,
            minimumVersion: values.ios.minimumVersion.trim() || null,
            storeUrl: values.ios.storeUrl.trim() || null,
          },
          android: {
            effectiveVersion: values.android.effectiveVersion.trim() || null,
            minimumVersion: values.android.minimumVersion.trim() || null,
            storeUrl: values.android.storeUrl.trim() || null,
          },
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          errors?: string[];
          message?: string;
        } | null;
        throw new Error(body?.errors?.[0] || body?.message || t('save_error'));
      }

      return response.json();
    },
    onSuccess: (_, values) => {
      form.reset(values);
      toast.success(t('save_success'));
      router.refresh();
    },
    onError: (error) => {
      toast.error(error.message || t('save_error'));
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
        className="space-y-6"
      >
        <div className="grid gap-6 lg:grid-cols-2">
          {(['ios', 'android'] as const).map((platform) => (
            <div
              key={platform}
              className="space-y-4 rounded-xl border border-border bg-card p-6"
            >
              <div className="space-y-1">
                <h2 className="font-semibold text-lg">
                  {t(`${platform}.title`)}
                </h2>
                <p className="text-muted-foreground text-sm">
                  {t(`${platform}.description`)}
                </p>
              </div>

              <FormField
                control={form.control}
                name={`${platform}.effectiveVersion`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('fields.effective_version')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t('fields.version_placeholder')}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('fields.effective_version_description')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name={`${platform}.minimumVersion`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('fields.minimum_version')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t('fields.version_placeholder')}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('fields.minimum_version_description')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name={`${platform}.storeUrl`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('fields.store_url')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t('fields.store_url_placeholder')}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('fields.store_url_description')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          ))}
        </div>

        <Button
          type="submit"
          disabled={saveMutation.isPending || !form.formState.isDirty}
        >
          {saveMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('saving')}
            </>
          ) : (
            t('save')
          )}
        </Button>
      </form>
    </Form>
  );
}
