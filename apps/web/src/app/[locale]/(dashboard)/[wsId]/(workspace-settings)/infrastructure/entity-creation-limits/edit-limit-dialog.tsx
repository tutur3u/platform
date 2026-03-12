'use client';

import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
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
import { Separator } from '@tuturuuu/ui/separator';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  reattachPlatformEntityCreationLimitTrigger,
  updatePlatformEntityCreationLimitMetadata,
  updatePlatformEntityCreationLimitTier,
} from './actions';
import type { TableGroup, WorkspaceProductTier } from './types';
import { getLimitInputValue, TIER_ORDER } from './types';

interface Props {
  wsId: string;
  group: TableGroup | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface MetadataFormValues {
  notes: string;
}

interface TierFormValues {
  enabled: boolean;
  perHour: string;
  perDay: string;
  perWeek: string;
  perMonth: string;
  totalLimit: string;
}

export function EditLimitDialog({ wsId, group, open, onOpenChange }: Props) {
  const t = useTranslations('entity-creation-limits');
  const [isLoading, setIsLoading] = useState(false);

  if (!group) return null;

  const { tableName, metadata, tiers } = group;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-base">{tableName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* Table settings form */}
          <section className="space-y-4">
            <h3 className="font-semibold text-sm">{t('section.metadata')}</h3>
            <MetadataForm
              tableName={tableName}
              metadata={metadata}
              wsId={wsId}
              isLoading={isLoading}
              setIsLoading={setIsLoading}
              t={t}
            />
          </section>

          <Separator />

          {/* Per-tier limit forms */}
          <section className="space-y-4">
            <h3 className="font-semibold text-sm">
              {t('section.tier_limits')}
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {TIER_ORDER.map((tierKey) => {
                const tier = tiers.find((r) => r.tier === tierKey);

                if (!tier) return null;

                return (
                  <TierForm
                    key={tier.tier}
                    tier={tier}
                    tableName={tableName}
                    wsId={wsId}
                    isLoading={isLoading}
                    setIsLoading={setIsLoading}
                    t={t}
                  />
                );
              })}
            </div>
          </section>

          <Separator />

          {/* Reattach trigger */}
          <Button
            variant="outline"
            size="sm"
            disabled={isLoading}
            onClick={async () => {
              setIsLoading(true);
              try {
                await reattachPlatformEntityCreationLimitTrigger(
                  wsId,
                  tableName
                );
              } finally {
                setIsLoading(false);
              }
            }}
          >
            {t('actions.reattach_trigger')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MetadataForm({
  tableName,
  metadata,
  wsId,
  isLoading,
  setIsLoading,
  t,
}: {
  tableName: string;
  metadata: TableGroup['metadata'];
  wsId: string;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const form = useForm<MetadataFormValues>({
    defaultValues: {
      notes: metadata.notes ?? '',
    },
  });

  const onSubmit = async (values: MetadataFormValues) => {
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('notes', values.notes);

      await updatePlatformEntityCreationLimitMetadata(
        wsId,
        tableName,
        formData
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormDescription>{t('metadata.requirements_hint')}</FormDescription>

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('fields.notes')}</FormLabel>
              <FormControl>
                <Textarea
                  placeholder={t('fields.notes_placeholder')}
                  rows={2}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div>
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={isLoading}
          >
            {t('actions.save_metadata')}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function TierForm({
  tier,
  tableName,
  wsId,
  isLoading,
  setIsLoading,
  t,
}: {
  tier: TableGroup['tiers'][0];
  tableName: string;
  wsId: string;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const form = useForm<TierFormValues>({
    defaultValues: {
      enabled: tier.enabled,
      perHour: getLimitInputValue(tier.per_hour),
      perDay: getLimitInputValue(tier.per_day),
      perWeek: getLimitInputValue(tier.per_week),
      perMonth: getLimitInputValue(tier.per_month),
      totalLimit: getLimitInputValue(tier.total_limit),
    },
  });

  const onSubmit = async (values: TierFormValues) => {
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('enabled', String(values.enabled));
      formData.append('perHour', values.perHour);
      formData.append('perDay', values.perDay);
      formData.append('perWeek', values.perWeek);
      formData.append('perMonth', values.perMonth);
      formData.append('totalLimit', values.totalLimit);

      await updatePlatformEntityCreationLimitTier(
        wsId,
        tableName,
        tier.tier as WorkspaceProductTier,
        formData
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid gap-3 rounded-lg border border-border bg-background p-4"
      >
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-semibold text-xs uppercase tracking-wide">
            {t(`tiers.${tier.tier}`)}
          </h4>
          <FormField
            control={form.control}
            name="enabled"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2">
                <FormControl>
                  <input
                    type="checkbox"
                    checked={field.value}
                    onChange={field.onChange}
                    className="h-4 w-4 rounded border-border"
                  />
                </FormControl>
                <FormLabel className="text-xs">{t('fields.enabled')}</FormLabel>
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="perHour"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">{t('limits.per_hour')}</FormLabel>
              <FormControl>
                <Input type="number" min={1} className="h-8" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="perDay"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">{t('limits.per_day')}</FormLabel>
              <FormControl>
                <Input type="number" min={1} className="h-8" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="perWeek"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">{t('limits.per_week')}</FormLabel>
              <FormControl>
                <Input type="number" min={1} className="h-8" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="perMonth"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">{t('limits.per_month')}</FormLabel>
              <FormControl>
                <Input type="number" min={1} className="h-8" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="totalLimit"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">
                {t('limits.total_limit')}
              </FormLabel>
              <FormControl>
                <Input type="number" min={1} className="h-8" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" variant="outline" size="sm" disabled={isLoading}>
          {t('actions.save_tier')}
        </Button>
      </form>
    </Form>
  );
}
