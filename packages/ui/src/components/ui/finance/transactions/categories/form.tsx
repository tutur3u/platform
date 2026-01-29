'use client';

import { ArrowDownCircle, ArrowUpCircle } from '@tuturuuu/icons';
import type { TransactionCategory } from '@tuturuuu/types/primitives/TransactionCategory';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { ColorPicker } from '@tuturuuu/ui/color-picker';
import IconPicker, {
  getIconComponentByKey,
  type WorkspaceBoardIconKey,
} from '@tuturuuu/ui/custom/icon-picker';
import { SelectField } from '@tuturuuu/ui/custom/select-field';
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
import { Label } from '@tuturuuu/ui/label';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { computeAccessibleLabelStyles } from '@tuturuuu/utils/label-colors';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import * as z from 'zod';

interface CategoryPreviewBadgeProps {
  name: string;
  icon?: string | null;
  color?: string | null;
  isExpense: boolean;
}

function CategoryPreviewBadge({
  name,
  icon,
  color,
  isExpense,
}: CategoryPreviewBadgeProps) {
  const IconComponent = icon
    ? getIconComponentByKey(icon as WorkspaceBoardIconKey)
    : null;

  // Use custom color if provided, otherwise fall back to expense/income colors
  if (color) {
    const colorStyles = computeAccessibleLabelStyles(color);
    if (colorStyles) {
      return (
        <Badge
          variant="outline"
          className="flex items-center gap-1.5 font-semibold text-xs transition-colors"
          style={{
            backgroundColor: colorStyles.bg,
            borderColor: colorStyles.border,
            color: colorStyles.text,
          }}
        >
          {IconComponent ? (
            <IconComponent className="h-3.5 w-3.5" />
          ) : isExpense ? (
            <ArrowDownCircle className="h-3.5 w-3.5" />
          ) : (
            <ArrowUpCircle className="h-3.5 w-3.5" />
          )}
          {name}
        </Badge>
      );
    }
  }

  // Default styling based on expense/income
  const DefaultIcon = isExpense ? ArrowDownCircle : ArrowUpCircle;
  return (
    <Badge
      variant="outline"
      className={`flex items-center gap-1.5 font-semibold text-xs transition-colors ${
        isExpense
          ? 'border-dynamic-red/40 bg-dynamic-red/10 text-dynamic-red'
          : 'border-dynamic-green/40 bg-dynamic-green/10 text-dynamic-green'
      }`}
    >
      {IconComponent ? (
        <IconComponent className="h-3.5 w-3.5" />
      ) : (
        <DefaultIcon className="h-3.5 w-3.5" />
      )}
      {name}
    </Badge>
  );
}

interface Props {
  wsId: string;
  data?: TransactionCategory;

  onFinish?: (data: z.infer<typeof FormSchema>) => void;
}

const FormSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(255),
  type: z.string(),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
});

export function TransactionCategoryForm({ wsId, data, onFinish }: Props) {
  const t = useTranslations();

  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      id: data?.id,
      name: data?.name || '',
      type: data?.is_expense === false ? 'INCOME' : 'EXPENSE',
      icon: data?.icon || null,
      color: data?.color || null,
    },
  });

  const watchedName = form.watch('name');
  const watchedType = form.watch('type');
  const watchedIcon = form.watch('icon');
  const watchedColor = form.watch('color');

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    setLoading(true);

    const res = await fetch(
      data?.id
        ? `/api/workspaces/${wsId}/transactions/categories/${data.id}`
        : `/api/workspaces/${wsId}/transactions/categories`,
      {
        method: data?.id ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: data.name,
          is_expense: data.type === 'EXPENSE',
          icon: data.icon || null,
          color: data.color || null,
        }),
      }
    );

    if (res.ok) {
      onFinish?.(data);
      router.refresh();
    } else {
      setLoading(false);
      toast({
        title: 'Error creating category',
        description: 'An error occurred while creating the category',
      });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2">
        <div className="grid gap-2 md:grid-cols-2">
          <FormField
            control={form.control}
            name="name"
            disabled={loading}
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t('transaction-category-data-table.category_name')}
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder={t(
                      'transaction-category-data-table.name_examples'
                    )}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormLabel>
                  {t('transaction-category-data-table.category_type')}
                </FormLabel>
                <FormControl>
                  <SelectField
                    id="category-type"
                    placeholder={t(
                      'transaction-category-data-table.select_type'
                    )}
                    options={[
                      {
                        value: 'EXPENSE',
                        label: t('transaction-category-data-table.expense'),
                      },
                      {
                        value: 'INCOME',
                        label: t('transaction-category-data-table.income'),
                      },
                    ]}
                    classNames={{ root: 'w-full' }}
                    {...field}
                    onValueChange={(value) => field.onChange(value)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="icon"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t('transaction-category-data-table.icon')}
                </FormLabel>
                <FormControl>
                  <div className="flex items-center gap-2">
                    <IconPicker
                      value={field.value as WorkspaceBoardIconKey | null}
                      onValueChange={(value) => field.onChange(value)}
                      disabled={loading}
                      allowClear
                      title={t('transaction-category-data-table.select_icon')}
                      description={t(
                        'transaction-category-data-table.icon_description'
                      )}
                      searchPlaceholder={t(
                        'transaction-category-data-table.search_icons'
                      )}
                      clearLabel={t('common.clear')}
                    />
                    <span className="text-muted-foreground text-sm">
                      {field.value ||
                        t('transaction-category-data-table.no_icon')}
                    </span>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="color"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t('transaction-category-data-table.color')}
                </FormLabel>
                <FormControl>
                  <div className="flex items-center gap-2">
                    <ColorPicker
                      value={field.value || '#6b7280'}
                      onChange={(value) => field.onChange(value)}
                      disabled={loading}
                    />
                    <span className="text-muted-foreground text-sm">
                      {field.value ||
                        t('transaction-category-data-table.no_color')}
                    </span>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Preview */}
        <div
          className="space-y-2"
          key={`${watchedName}-${watchedIcon}-${watchedColor}`}
        >
          <Label>{t('transaction-category-data-table.preview')}</Label>
          <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4">
            <CategoryPreviewBadge
              name={watchedName || t('transaction-category-data-table.name')}
              icon={watchedIcon}
              color={watchedColor}
              isExpense={watchedType === 'EXPENSE'}
            />
          </div>
        </div>

        <div className="h-2" />

        <Button type="submit" className="w-full" disabled={loading}>
          {loading
            ? t('common.processing')
            : data?.id
              ? t('ws-transaction-categories.edit')
              : t('ws-transaction-categories.create')}
        </Button>
      </form>
    </Form>
  );
}
