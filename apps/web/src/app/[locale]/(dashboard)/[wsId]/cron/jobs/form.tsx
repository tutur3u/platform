'use client';

import { Plus, Trash2 } from '@tuturuuu/icons';
import {
  createWorkspaceCronJob,
  type SaveWorkspaceCronJobPayload,
  updateWorkspaceCronJob,
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
import { useFieldArray, useForm } from '@tuturuuu/ui/hooks/use-form';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import cronstrue from 'cronstrue';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import * as z from 'zod';
import { useWorkspaceDatasets } from '@/hooks/useWorkspaceDatasets';
import type { ManagedWorkspaceCronJob } from '../types';

function getHumanReadableSchedule(cronExpression: string) {
  try {
    return cronstrue.toString(cronExpression, {
      use24HourTimeFormat: true,
      verbose: true,
    });
  } catch {
    return null;
  }
}

const FormSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Name is required'),
  schedule: z.string().min(1, 'Schedule is required'),
  active: z.boolean().default(true),
  dataset_id: z.string().optional(),
  endpoint_url: z.string().optional(),
  headers_config: z
    .array(
      z.object({
        name: z.string().optional(),
        secretName: z.string().optional(),
        value: z.string().optional(),
      })
    )
    .default([]),
  http_method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
  retry_count: z.coerce.number().int().min(0).max(3).default(0),
  timeout_ms: z.coerce.number().int().min(1000).max(60000).default(15000),
  ws_id: z.string(),
});

interface Props {
  wsId: string;
  data?: ManagedWorkspaceCronJob;
  onFinish?: (data: z.infer<typeof FormSchema>) => void;
}

export function CronJobForm({ wsId, data, onFinish }: Props) {
  const router = useRouter();
  const t = useTranslations();
  const params = useParams();
  const [saving, setSaving] = useState(false);

  // Get dataset ID from URL if available
  const datasetId = params?.datasetId as string;

  const form = useForm({
    resolver: zodResolver(FormSchema),
    values: {
      id: data?.id || undefined,
      name: data?.name || '',
      schedule: data?.schedule || '',
      active: data?.active ?? true,
      dataset_id: data?.dataset_id || datasetId || '',
      endpoint_url: data?.endpoint_url || '',
      headers_config:
        data?.headers_config?.map((header) => ({
          name: header.name ?? '',
          secretName: header.secretName ?? '',
          value: header.value ?? '',
        })) ?? [],
      http_method: data?.http_method || 'GET',
      retry_count: data?.retry_count ?? 0,
      timeout_ms: data?.timeout_ms ?? 15000,
      ws_id: wsId,
    },
  });

  const { append, fields, remove } = useFieldArray({
    control: form.control,
    name: 'headers_config',
  });

  const { data: datasets, isLoading: loadingDatasets } =
    useWorkspaceDatasets(wsId);

  const onSubmit = async (formData: z.infer<typeof FormSchema>) => {
    setSaving(true);
    try {
      const payload: SaveWorkspaceCronJobPayload = {
        active: formData.active,
        dataset_id:
          formData.dataset_id && formData.dataset_id !== 'none'
            ? formData.dataset_id
            : null,
        endpoint_url: formData.endpoint_url || null,
        headers_config: formData.headers_config
          .map((header) => ({
            name: header.name?.trim() ?? '',
            secretName: header.secretName?.trim() || null,
            value: header.value?.trim() || null,
          }))
          .filter(
            (header) => header.name && (header.secretName || header.value)
          ),
        http_method: formData.http_method,
        name: formData.name,
        retry_count: formData.retry_count,
        schedule: formData.schedule,
        timeout_ms: formData.timeout_ms,
      };

      if (formData.id) {
        await updateWorkspaceCronJob(wsId, formData.id, payload);
      } else {
        await createWorkspaceCronJob(wsId, payload);
      }

      onFinish?.(formData);
      router.refresh();
    } catch (error) {
      toast({
        title: t(
          formData.id
            ? 'cron-job-form.update_failed'
            : 'cron-job-form.create_failed'
        ),
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3">
        <ScrollArea className="max-h-96">
          <div className="grid gap-2">
            {data?.id && (
              <>
                <FormField
                  control={form.control}
                  name="id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('cron-job-form.job_id')}</FormLabel>
                      <FormControl>
                        <Input {...field} disabled />
                      </FormControl>
                      <FormMessage />
                      <FormDescription>
                        {t('cron-job-form.job_id_description')}
                      </FormDescription>
                    </FormItem>
                  )}
                />
                <Separator />
              </>
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('cron-job-form.name')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('cron-job-form.name_placeholder')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="schedule"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('cron-job-form.schedule_label')}</FormLabel>
                  <FormControl>
                    <Input placeholder="0 0 * * *" {...field} />
                  </FormControl>
                  <FormDescription className="flex flex-col gap-1">
                    <span>{t('cron-job-form.common_examples')}</span>
                    <span className="text-muted-foreground text-xs">
                      {t('cron-job-form.example_midnight')}
                      <br />
                      {t('cron-job-form.example_every_15_minutes')}
                      <br />
                      {t('cron-job-form.example_weekdays')}
                    </span>
                    {field.value && (
                      <span className="mt-2 text-muted-foreground text-sm">
                        {getHumanReadableSchedule(field.value) ??
                          t('cron-job-form.invalid_cron_expression')}
                      </span>
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-2 rounded-md border p-3">
              <div>
                <p className="font-medium text-sm">
                  {t('cron-job-form.managed_endpoint')}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t('cron-job-form.managed_endpoint_description')}
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
                <FormField
                  control={form.control}
                  name="http_method"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('cron-job-form.method')}</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="GET" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(
                            (method) => (
                              <SelectItem key={method} value={method}>
                                {method}
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="endpoint_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('cron-job-form.endpoint_url')}</FormLabel>
                      <FormControl>
                        <Input
                          aria-label={t('cron-job-form.endpoint_url')}
                          placeholder="https://hooks.example.com/tuturuuu/cron"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="timeout_ms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('cron-job-form.timeout_ms')}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1000}
                          max={60000}
                          {...field}
                          value={field.value as number | string}
                        />
                      </FormControl>
                      <FormDescription>
                        {t('cron-job-form.timeout_description')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="retry_count"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('cron-job-form.retries')}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          max={3}
                          {...field}
                          value={field.value as number | string}
                        />
                      </FormControl>
                      <FormDescription>
                        {t('cron-job-form.retries_description')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">
                      {t('cron-job-form.request_headers')}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {t('cron-job-form.request_headers_description')}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      append({ name: '', secretName: '', value: '' })
                    }
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    {t('cron-job-form.add_header')}
                  </Button>
                </div>

                {fields.length === 0 ? (
                  <p className="rounded-md border border-dashed p-3 text-muted-foreground text-sm">
                    {t('cron-job-form.no_custom_headers')}
                  </p>
                ) : (
                  <div className="grid gap-2">
                    {fields.map((field, index) => (
                      <div
                        key={field.id}
                        className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
                      >
                        <FormField
                          control={form.control}
                          name={`headers_config.${index}.name`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t('cron-job-form.header')}</FormLabel>
                              <FormControl>
                                <Input
                                  aria-label={t('cron-job-form.header')}
                                  placeholder="Authorization"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`headers_config.${index}.secretName`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                {t('cron-job-form.secret_name')}
                              </FormLabel>
                              <FormControl>
                                <Input
                                  aria-label={t('cron-job-form.secret_name')}
                                  placeholder="MY_WEBHOOK_TOKEN"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`headers_config.${index}.value`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                {t('cron-job-form.static_value')}
                              </FormLabel>
                              <FormControl>
                                <Input
                                  aria-label={t('cron-job-form.static_value')}
                                  placeholder="Bearer ..."
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="self-end"
                          onClick={() => remove(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">
                            {t('cron-job-form.remove_header')}
                          </span>
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <FormField
              control={form.control}
              name="dataset_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('cron-job-form.dataset')}</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={!!datasetId}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            loadingDatasets
                              ? t('common.loading')
                              : t('cron-job-form.select_dataset')
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">
                        {t('cron-job-form.no_dataset')}
                      </SelectItem>
                      {datasets?.map((dataset) => (
                        <SelectItem key={dataset.id} value={dataset.id}>
                          {dataset.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {datasetId
                      ? t('cron-job-form.dataset_preselected')
                      : t('cron-job-form.dataset_description')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            <FormField
              control={form.control}
              name="active"
              render={({ field }) => (
                <FormItem className="flex items-center space-x-2">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      id="active"
                    />
                  </FormControl>
                  <label
                    htmlFor="active"
                    className="font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {t('cron-job-form.active')}
                  </label>
                </FormItem>
              )}
            />
          </div>
        </ScrollArea>

        <Separator className="my-2" />

        <div className="flex justify-center gap-2">
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? t('common.saving') : t('common.save_changes')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
