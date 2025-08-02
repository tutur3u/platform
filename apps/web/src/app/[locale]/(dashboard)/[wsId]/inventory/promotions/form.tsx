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
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';

interface Props {
  wsId: string;
  wsUserId?: string;
  data?: ProductPromotion;
  onFinish?: (data: z.infer<typeof FormSchema>) => void;
}

const FormSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    code: z.string().min(1).max(255),
    value: z.number().min(0),
    unit: z.string(),
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

export function PromotionForm({ wsId, wsUserId, data, onFinish }: Props) {
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
      value: data?.value ? parseInt(data?.value.toString()) : undefined,
      unit: data?.use_ratio ? 'percentage' : 'currency',
    },
  });

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    setLoading(true);

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
          ...data,
          creator_id: wsUserId,
        }),
      }
    );

    if (res.ok) {
      onFinish?.(data);
      router.refresh();
    } else {
      setLoading(false);
      toast({
        title: 'Error creating promotion',
        description: 'An error occurred while creating the promotion',
      });
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
                    {...field}
                    placeholder={t('ws-inventory-promotions.form.value')}
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

        <Button type="submit" className="w-full" disabled={loading}>
          {loading
            ? t('common.processing')
            : data?.id
              ? t('common.edit')
              : t('common.create')}
        </Button>
      </form>
    </Form>
  );
}
