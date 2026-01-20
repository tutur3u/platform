'use client';

import { useMutation } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Database } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { Combobox, type ComboboxOptions } from '@tuturuuu/ui/custom/combobox';
import {
  Form,
  FormControl,
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
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';

type WorkspaceSettings =
  Database['public']['Tables']['workspace_settings']['Row'];

interface Props {
  wsId: string;
  data?: WorkspaceSettings | WorkspaceSettings[];
  regularPromotions?: Array<{
    id: string;
    name: string | null;
    code: string | null;
    value: number;
    use_ratio: boolean;
  }>;
  onFinish?: (data: z.infer<typeof FormSchema>) => void;
}

const FormSchema = z.object({
  referral_count_cap: z.coerce.number().int().min(0),
  referral_increment_percent: z.coerce.number().min(0),
  referral_promotion_id: z.string().uuid().nullable().optional(),
  referral_reward_type: z.enum(['REFERRER', 'RECEIVER', 'BOTH']),
});

export default function WorkspaceSettingsForm({
  wsId,
  data,
  regularPromotions,
}: Props) {
  const t = useTranslations();
  const [loading, setLoading] = useState(false);
  const [promotionOptions, setPromotionOptions] = useState<ComboboxOptions[]>(
    []
  );
  const router = useRouter();

  const row = Array.isArray(data) ? data[0] : data;

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      referral_count_cap: row?.referral_count_cap ?? 0,
      referral_increment_percent: row?.referral_increment_percent ?? 0,
      referral_promotion_id: row?.referral_promotion_id ?? null,
      referral_reward_type:
        (row?.referral_reward_type as 'REFERRER' | 'RECEIVER' | 'BOTH') ??
        'REFERRER',
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof FormSchema>) => {
      const supabase = createClient();
      const { error } = await supabase.from('workspace_settings').upsert({
        ws_id: wsId,
        referral_count_cap: values.referral_count_cap,
        referral_increment_percent: values.referral_increment_percent,
        referral_promotion_id: values.referral_promotion_id ?? null,
        referral_reward_type: values.referral_reward_type,
      });
      if (error) throw error;

      // If default referral promotion changed, migrate user_linked_promotions
      const previousPromoId = row?.referral_promotion_id ?? null;
      const nextPromoId = values.referral_promotion_id ?? null;

      if (previousPromoId && nextPromoId && previousPromoId !== nextPromoId) {
        try {
          // 1) Find users in this workspace with a referrer
          const { data: referredUsers, error: usersErr } = await supabase
            .from('workspace_users')
            .select('id')
            .eq('ws_id', wsId)
            .not('referred_by', 'is', null);
          if (usersErr) throw usersErr;

          const userIds = (referredUsers ?? []).map(
            (u: { id: string }) => u.id
          );
          if (userIds.length === 0) {
            return values;
          }

          // 2) Among those users, find who is currently linked to the old default promo
          const { data: oldLinks, error: linksErr } = await supabase
            .from('user_linked_promotions')
            .select('user_id')
            .eq('promo_id', previousPromoId)
            .in('user_id', userIds);
          if (linksErr) throw linksErr;

          const affectedUserIds = (oldLinks ?? []).map(
            (l: { user_id: string }) => l.user_id
          );
          if (affectedUserIds.length === 0) {
            // No old links found → add link for all referred users to the new default promo
            const upsertAllPayload = userIds.map((uid) => ({
              user_id: uid,
              promo_id: nextPromoId,
            }));
            const { error: upsertAllErr } = await supabase
              .from('user_linked_promotions')
              .upsert(upsertAllPayload, { onConflict: 'user_id,promo_id' });
            if (upsertAllErr) throw upsertAllErr;
            return values;
          }

          // 3) Upsert new links for affected users to the new default promo
          const upsertPayload = affectedUserIds.map((uid) => ({
            user_id: uid,
            promo_id: nextPromoId,
          }));
          const { error: upsertErr } = await supabase
            .from('user_linked_promotions')
            .upsert(upsertPayload, { onConflict: 'user_id,promo_id' });
          if (upsertErr) throw upsertErr;

          // 4) Remove old links to the previous default promo for those users
          const { error: deleteErr } = await supabase
            .from('user_linked_promotions')
            .delete()
            .eq('promo_id', previousPromoId)
            .in('user_id', affectedUserIds);
          if (deleteErr) throw deleteErr;
        } catch (e) {
          // Best-effort migration: do not block settings save, surface toast via onError handler
          console.error(
            'Failed to migrate referral default promotion links',
            e
          );
        }
      }
      return values;
    },
    onSuccess: () => {
      toast.success(t('common.success'));
      router.refresh();
    },
    onError: () => {
      toast.error(t('common.error'));
    },
  });

  async function onSubmit(values: z.infer<typeof FormSchema>) {
    setLoading(true);
    try {
      await mutation.mutateAsync(values);
    } finally {
      setLoading(false);
    }
  }

  // Use React Query to consume hydrated data from server and map to options
  const mappedOptions = useMemo<ComboboxOptions[]>(() => {
    const promos = regularPromotions ?? [];
    return promos.map((p) => {
      const baseLabel = p.name
        ? `${p.name}${p.code ? ` (${p.code})` : ''}`
        : (p.code ?? p.id);
      const valueLabel = p.use_ratio ? `${p.value}%` : `${p.value}`;
      return {
        value: p.id,
        label: `${baseLabel} - ${valueLabel}`,
      };
    });
  }, [regularPromotions]);

  useEffect(() => {
    setPromotionOptions(mappedOptions);
  }, [mappedOptions]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="w-full space-y-6">
        <FormField
          control={form.control}
          name="referral_reward_type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('inventory.referral_reward_type')}</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t('inventory.select_reward_type')}
                    />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="REFERRER">
                    {t('inventory.reward_referrer_only')}
                  </SelectItem>
                  <SelectItem value="RECEIVER">
                    {t('inventory.reward_receiver_only')}
                  </SelectItem>
                  <SelectItem value="BOTH">
                    {t('inventory.reward_both')}
                  </SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="referral_count_cap"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('inventory.referral_count_cap')}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  value={field.value as number | string | undefined}
                  onChange={(e) => field.onChange(e.target.value)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="referral_increment_percent"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('inventory.referral_increment_percent')}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  value={field.value as number | string | undefined}
                  onChange={(e) => field.onChange(e.target.value)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="referral_promotion_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('inventory.default_referral_promotion')}</FormLabel>
              <FormControl>
                <Combobox
                  t={(key: string) =>
                    key === 'common.empty'
                      ? t('common.empty')
                      : key === 'common.add'
                        ? t('common.add')
                        : key
                  }
                  options={[
                    { value: '', label: t('ws-promotions.no_promotion') },
                    ...promotionOptions,
                  ]}
                  selected={(field.value as string) ?? ''}
                  placeholder={t('ws-promotions.search_promotions')}
                  onChange={(value) => field.onChange(value ? value : null)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          className="w-full"
          disabled={loading || mutation.isPending || !form.formState.isDirty}
        >
          {loading || mutation.isPending
            ? t('common.processing')
            : t('common.save')}
        </Button>
      </form>
    </Form>
  );
}
