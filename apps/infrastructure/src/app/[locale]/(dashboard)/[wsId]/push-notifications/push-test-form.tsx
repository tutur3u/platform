'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { LoaderCircle, Send } from '@tuturuuu/icons';
import {
  type InfrastructurePushAppFlavor,
  sendInfrastructurePushTest,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
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
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

type FormValues = {
  appFlavor: InfrastructurePushAppFlavor;
  body: string;
  dataJson: string;
  deliveryKind: 'data_only' | 'notification';
  deviceId: string;
  platform: 'all' | 'android' | 'ios';
  sendToAll: boolean;
  title: string;
  token: string;
  userId: string;
};

type PushDeviceCoverage = Record<
  InfrastructurePushAppFlavor,
  Record<'all' | 'android' | 'ios', number>
>;

interface PushTestFormProps {
  canSend: boolean;
  defaultAppFlavor: InfrastructurePushAppFlavor;
  deviceCoverage?: PushDeviceCoverage;
}

const EMPTY_DEVICE_COVERAGE: PushDeviceCoverage = {
  development: { all: 0, android: 0, ios: 0 },
  production: { all: 0, android: 0, ios: 0 },
  staging: { all: 0, android: 0, ios: 0 },
};

function getSelectionCountMessage(locale: string, count: number) {
  if (locale === 'vi') {
    return `${count} thiet bi da dang ky khop voi lua chon moi truong/nen tang hien tai.`;
  }

  return `${count} registered devices match the current environment/platform selection.`;
}

function getSelectionEmptyMessage(locale: string) {
  if (locale === 'vi') {
    return 'Khong co thiet bi da dang ky nao khop voi lua chon moi truong/nen tang hien tai.';
  }

  return 'No registered devices match the current environment/platform selection.';
}

function getSelectionSuggestionMessage(locale: string, flavor: string) {
  if (locale === 'vi') {
    return `Chua co thiet bi nao khop voi lua chon nay. Hay thu ${flavor} hoac dang ky thiet bi trong moi truong nay.`;
  }

  return `No devices match this selection yet. Try ${flavor} or register a device in this environment.`;
}

function parseDataJson(value: string): Record<string, string> | undefined {
  if (value.trim().length === 0) {
    return undefined;
  }

  return z.record(z.string(), z.string()).parse(JSON.parse(value));
}

function getRecommendedFlavor(
  coverage: PushDeviceCoverage,
  excludeFlavor: InfrastructurePushAppFlavor
) {
  const orderedFlavors: InfrastructurePushAppFlavor[] = [
    'production',
    'staging',
    'development',
  ];

  return orderedFlavors.find(
    (flavor) => flavor !== excludeFlavor && coverage[flavor].all > 0
  );
}

export function PushTestForm({
  canSend,
  defaultAppFlavor,
  deviceCoverage,
}: PushTestFormProps) {
  const locale = useLocale();
  const rawT = useTranslations(
    'settings-account.push-notification-dashboard' as never
  );
  const t = (key: string, values?: Record<string, unknown>) => {
    return rawT(key as never, values as never);
  };
  const tRaw = (key: string) => {
    try {
      return rawT.raw(key as never) as string;
    } catch {
      return key === 'form.data_json_placeholder'
        ? '{\n  "source": "infra-dashboard"\n}'
        : key;
    }
  };
  const coverage = deviceCoverage ?? EMPTY_DEVICE_COVERAGE;
  const [lastResult, setLastResult] = useState<{
    deliveredCount: number;
    invalidTokensRemoved: number;
    matchedDevices: number;
    truncated: boolean;
  } | null>(null);

  const formSchema = z
    .object({
      appFlavor: z.enum(['development', 'staging', 'production']),
      body: z.string().trim().min(1),
      dataJson: z.string(),
      deliveryKind: z.enum(['notification', 'data_only']),
      deviceId: z.string().trim(),
      platform: z.enum(['all', 'android', 'ios']),
      sendToAll: z.boolean(),
      title: z.string().trim().min(1),
      token: z.string().trim(),
      userId: z.string().trim(),
    })
    .superRefine((value, ctx) => {
      const targetedFields = [value.deviceId, value.token, value.userId].filter(
        (field) => field.length > 0
      ).length;

      if (value.sendToAll && targetedFields > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sendToAll'],
          message: t('validation.broadcast_conflict'),
        });
      }

      if (!value.sendToAll && targetedFields === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sendToAll'],
          message: t('validation.target_required'),
        });
      }

      if (value.userId.length > 0) {
        const userIdResult = z.string().uuid().safeParse(value.userId);
        if (!userIdResult.success) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['userId'],
            message: t('validation.user_id_invalid'),
          });
        }
      }

      if (value.dataJson.trim().length > 0) {
        try {
          const parsed = JSON.parse(value.dataJson) as unknown;
          const recordResult = z
            .record(z.string(), z.string())
            .safeParse(parsed);
          if (!recordResult.success) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['dataJson'],
              message: t('validation.data_json_string_values'),
            });
          }
        } catch {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['dataJson'],
            message: t('validation.data_json_invalid'),
          });
        }
      }
    });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      appFlavor: defaultAppFlavor,
      body: '',
      dataJson: '{\n  "source": "infra-dashboard"\n}',
      deliveryKind: 'notification',
      deviceId: '',
      platform: 'all',
      sendToAll: false,
      title: '',
      token: '',
      userId: '',
    },
  });

  const sendToAll = form.watch('sendToAll');
  const selectedFlavor = form.watch('appFlavor');
  const selectedPlatform = form.watch('platform');
  const selectedCoverageCount = coverage[selectedFlavor][selectedPlatform];
  const suggestedFlavor = getRecommendedFlavor(coverage, selectedFlavor);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) =>
      sendInfrastructurePushTest({
        appFlavor: values.appFlavor,
        body: values.body.trim(),
        data: parseDataJson(values.dataJson),
        deliveryKind: values.deliveryKind,
        deviceId: values.deviceId.trim() || undefined,
        platform: values.platform,
        sendToAll: values.sendToAll,
        title: values.title.trim(),
        token: values.token.trim() || undefined,
        userId: values.userId.trim() || undefined,
      }),
    onSuccess: (result) => {
      setLastResult(result);
      toast.success(t('form.send_success'));
    },
    onError: (error) => {
      if (
        error instanceof Error &&
        error.message.includes('No matching push devices were found.')
      ) {
        toast.error(
          suggestedFlavor
            ? getSelectionSuggestionMessage(
                locale,
                t(`flavors.${suggestedFlavor}`)
              )
            : getSelectionEmptyMessage(locale)
        );
        return;
      }

      toast.error(
        error instanceof Error ? error.message : t('form.send_error')
      );
    },
  });

  const helperText = sendToAll
    ? t('form.send_to_all_description')
    : t('form.target_description');

  return (
    <div className="space-y-4">
      {!canSend ? (
        <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
          {t('form.permission_note')}
        </div>
      ) : null}

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
        >
          <div className="grid gap-4 md:grid-cols-3">
            <FormField
              control={form.control}
              name="appFlavor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('form.app_flavor')}</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    disabled={!canSend}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="development">
                        {t('flavors.development')}
                      </SelectItem>
                      <SelectItem value="staging">
                        {t('flavors.staging')}
                      </SelectItem>
                      <SelectItem value="production">
                        {t('flavors.production')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="platform"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('form.platform')}</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    disabled={!canSend}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="all">{t('platforms.all')}</SelectItem>
                      <SelectItem value="ios">{t('platforms.ios')}</SelectItem>
                      <SelectItem value="android">
                        {t('platforms.android')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="deliveryKind"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('form.delivery_kind')}</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    disabled={!canSend}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="notification">
                        {t('delivery_kind.notification')}
                      </SelectItem>
                      <SelectItem value="data_only">
                        {t('delivery_kind.data_only')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {t('form.delivery_kind_description')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-3 text-muted-foreground text-sm">
            {selectedCoverageCount > 0
              ? getSelectionCountMessage(locale, selectedCoverageCount)
              : suggestedFlavor
                ? getSelectionSuggestionMessage(
                    locale,
                    t(`flavors.${suggestedFlavor}`)
                  )
                : getSelectionEmptyMessage(locale)}
          </div>

          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('form.title')}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    disabled={!canSend}
                    placeholder={t('form.title_placeholder')}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="body"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('form.body')}</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={3}
                    disabled={!canSend}
                    placeholder={t('form.body_placeholder')}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="space-y-3 rounded-lg border border-border bg-background p-4">
            <FormField
              control={form.control}
              name="sendToAll"
              render={({ field }) => (
                <FormItem className="flex items-start gap-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(!!checked)}
                      ref={field.ref}
                      disabled={!canSend}
                    />
                  </FormControl>
                  <div className="space-y-1">
                    <FormLabel>{t('form.send_to_all')}</FormLabel>
                    <FormDescription>{helperText}</FormDescription>
                  </div>
                </FormItem>
              )}
            />

            {!sendToAll ? (
              <div className="grid gap-4 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="userId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('form.user_id')}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          disabled={!canSend}
                          placeholder={t('form.user_id_placeholder')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="deviceId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('form.device_id')}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          disabled={!canSend}
                          placeholder={t('form.device_id_placeholder')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="token"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('form.token')}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          disabled={!canSend}
                          placeholder={t('form.token_placeholder')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ) : null}

            <FormMessage>
              {form.formState.errors.sendToAll?.message}
            </FormMessage>
          </div>

          <FormField
            control={form.control}
            name="dataJson"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('form.data_json')}</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={6}
                    disabled={!canSend}
                    placeholder={tRaw('form.data_json_placeholder')}
                  />
                </FormControl>
                <FormDescription>
                  {t('form.data_json_description')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" disabled={!canSend || mutation.isPending}>
            {mutation.isPending ? (
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            {t('form.send')}
          </Button>
        </form>
      </Form>

      {lastResult ? (
        <div className="rounded-lg border border-border bg-background p-4 text-sm">
          <div className="font-medium">{t('form.last_result')}</div>
          <div className="mt-2 grid gap-1 text-muted-foreground">
            <div>
              {t('form.result_summary', {
                delivered: lastResult.deliveredCount,
                matched: lastResult.matchedDevices,
              })}
            </div>
            <div>
              {t('form.invalid_tokens_removed', {
                count: lastResult.invalidTokensRemoved,
              })}
            </div>
            {lastResult.truncated ? (
              <div>{t('form.truncated_result')}</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
