'use client';

import type { ProductPromotion } from '@tuturuuu/types/primitives/ProductPromotion';
import { Button } from '@tuturuuu/ui/button';
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
import { Label } from '@tuturuuu/ui/label';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { z } from 'zod';

interface Props {
  wsId: string;
  data?: ProductPromotion;
  onFinish?: (
    formData: z.infer<typeof FormSchema>,
    promotion?: ProductPromotion
  ) => void;
  canCreateInventory?: boolean;
  canUpdateInventory?: boolean;
  onCancel?: () => void;
  showCancelButton?: boolean;
}

export const FormSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    code: z.string().min(1).max(255),
    value: z.coerce.number().min(0),
    unit: z.string(),
    // NULL/undefined = unlimited
    max_uses: z.union([z.coerce.number().int().min(1), z.null()]).optional(),
  })
  .refine(
    ({ unit, value }) =>
      (unit === 'percentage' && value <= 100) || unit !== 'percentage',
    {
      // TODO: i18n
      message: 'Percentage value cannot exceed 100%',
      path: ['value'],
    }
  );

export function PromotionForm({
  wsId,
  data,
  onFinish,
  canCreateInventory = true,
  canUpdateInventory = true,
  onCancel,
  showCancelButton = false,
}: Props) {
  const t = useTranslations();

  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      id: data?.id,
      name: data?.name,
      description: data?.description,
      code: data?.code,
      value: data?.value ? parseInt(data?.value.toString(), 10) : undefined,
      unit: data?.use_ratio ? 'percentage' : 'currency',
      max_uses: data?.max_uses,
    },
  });

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    setLoading(true);

    // Check permissions before proceeding
    if (!data?.id && !canCreateInventory) {
      toast.error(t('ws-roles.inventory_promotions_access_denied_description'));
      setLoading(false);
      return;
    }

    if (data?.id && !canUpdateInventory) {
      toast.error(t('ws-roles.inventory_promotions_access_denied_description'));
      setLoading(false);
      return;
    }

    const res = await fetch(
      data?.id
        ? `/api/v1/workspaces/${wsId}/promotions/${data.id}`
        : `/api/v1/workspaces/${wsId}/promotions`,
      {
        method: data?.id ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: data.name,
          description: data.description,
          code: data.code,
          value: data.value,
          unit: data.unit,
          max_uses: data.max_uses ?? null,
        }),
      }
    );

    if (res.ok) {
      const json = await res.json().catch(() => null);
      const promotion = json?.data as ProductPromotion | undefined;
      setLoading(false);
      onFinish?.(data, promotion);
      router.refresh();
      return promotion;
    } else {
      setLoading(false);
      const json = await res.json().catch(() => null);
      toast.error(
        json?.message || t('ws-inventory-promotions.failed_create_promotion')
      );
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="w-full space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('ws-inventory-promotions.form.name')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder={t('ws-inventory-promotions.form.name')}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {t('ws-inventory-promotions.form.description')}
              </FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder={t('ws-inventory-promotions.form.description')}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Separator className="my-4" />
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormLabel>{t('ws-inventory-promotions.form.code')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder={t('ws-inventory-promotions.form.code')}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex gap-6">
          <FormField
            control={form.control}
            name="value"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>{t('ws-inventory-promotions.form.value')}</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder={t('ws-inventory-promotions.form.value')}
                    onChange={(e) => field.onChange(e.target.valueAsNumber)}
                    onBlur={field.onBlur}
                    value={(field.value as number | undefined) ?? ''}
                    name={field.name}
                    ref={field.ref}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="unit"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t('ws-inventory-promotions.form.unit.placeholder')}
                </FormLabel>
                <FormControl>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-32">
                      <SelectValue
                        {...field}
                        placeholder={t(
                          'ws-inventory-promotions.form.unit.placeholder'
                        )}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="currency">
                        <FormLabel>
                          {t('ws-inventory-promotions.form.unit.currency')}
                        </FormLabel>
                      </SelectItem>
                      <SelectItem value="percentage">
                        <FormLabel>
                          {t('ws-inventory-promotions.form.unit.percentage')}
                        </FormLabel>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="max_uses"
          render={({ field }) => {
            const isUnlimitedUses =
              field.value === null || field.value === undefined;

            return (
              <FormItem className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="promotion-unlimited-uses">
                    {t('ws-inventory-promotions.form.unlimited_uses')}
                  </Label>
                  <Switch
                    id="promotion-unlimited-uses"
                    checked={isUnlimitedUses}
                    onCheckedChange={(checked) => {
                      field.onChange(checked ? null : 1);
                    }}
                  />
                </div>

                {!isUnlimitedUses && (
                  <div className="space-y-2">
                    <FormLabel>
                      {t('ws-inventory-promotions.form.max_uses')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder={t('ws-inventory-promotions.form.max_uses')}
                        onChange={(e) => {
                          const next = e.target.valueAsNumber;
                          field.onChange(Number.isFinite(next) ? next : null);
                        }}
                        onBlur={field.onBlur}
                        value={(field.value as number | null | undefined) ?? ''}
                        name={field.name}
                        ref={field.ref}
                        min={1}
                      />
                    </FormControl>
                    <FormMessage />
                  </div>
                )}
              </FormItem>
            );
          }}
        />

        <div className="flex gap-2">
          {showCancelButton && onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={loading}
              className="flex-1"
            >
              {t('common.cancel')}
            </Button>
          )}
          <Button
            type="submit"
            className={showCancelButton ? 'flex-1' : 'w-full'}
            disabled={loading}
          >
            {loading
              ? t('common.processing')
              : data?.id
                ? t('common.edit')
                : t('common.create')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
