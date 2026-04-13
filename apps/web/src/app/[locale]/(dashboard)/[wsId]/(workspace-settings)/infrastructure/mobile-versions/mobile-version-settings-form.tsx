'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import { updateMobileVersionPolicies } from '@tuturuuu/internal-api/infrastructure';
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
import { Switch } from '@tuturuuu/ui/switch';
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
    otpEnabled: boolean;
    storeUrl: string;
  };
  android: {
    effectiveVersion: string;
    minimumVersion: string;
    otpEnabled: boolean;
    storeUrl: string;
  };
  webOtpEnabled: boolean;
};

interface Props {
  initialData: MobileVersionPolicies;
}

function toFormValues(data: MobileVersionPolicies): FormValues {
  return {
    ios: {
      effectiveVersion: data.ios.effectiveVersion ?? '',
      minimumVersion: data.ios.minimumVersion ?? '',
      otpEnabled: data.ios.otpEnabled,
      storeUrl: data.ios.storeUrl ?? '',
    },
    android: {
      effectiveVersion: data.android.effectiveVersion ?? '',
      minimumVersion: data.android.minimumVersion ?? '',
      otpEnabled: data.android.otpEnabled,
      storeUrl: data.android.storeUrl ?? '',
    },
    webOtpEnabled: data.webOtpEnabled,
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
        otpEnabled: z.boolean(),
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
        otpEnabled: z.boolean(),
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
    webOtpEnabled: z.boolean(),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(initialData),
  });

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      return updateMobileVersionPolicies({
        ios: {
          effectiveVersion: values.ios.effectiveVersion.trim() || null,
          minimumVersion: values.ios.minimumVersion.trim() || null,
          otpEnabled: values.ios.otpEnabled,
          storeUrl: values.ios.storeUrl.trim() || null,
        },
        android: {
          effectiveVersion: values.android.effectiveVersion.trim() || null,
          minimumVersion: values.android.minimumVersion.trim() || null,
          otpEnabled: values.android.otpEnabled,
          storeUrl: values.android.storeUrl.trim() || null,
        },
        webOtpEnabled: values.webOtpEnabled,
      });
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
                name={`${platform}.otpEnabled`}
                render={({ field }) => (
                  <FormItem className="rounded-xl border border-border/60 bg-muted/20 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <FormLabel>{t('fields.otp_enabled')}</FormLabel>
                        <FormDescription>
                          {t('fields.otp_enabled_description', {
                            platform: t(`${platform}.title`),
                          })}
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

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

        <div className="rounded-xl border border-border bg-card p-6">
          <FormField
            control={form.control}
            name="webOtpEnabled"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <div className="space-y-1">
                  <FormLabel>{t('web.title')}</FormLabel>
                  <FormDescription>{t('web.description')}</FormDescription>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-muted/20 p-4">
                  <div className="space-y-1">
                    <p className="font-medium text-sm">
                      {t('fields.otp_enabled')}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {t('fields.web_otp_enabled_description')}
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
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
