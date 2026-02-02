'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Dices,
  ExternalLink,
} from '@tuturuuu/icons';
import type { TransactionCategory } from '@tuturuuu/types/primitives/TransactionCategory';
import { Button } from '@tuturuuu/ui/button';
import { ColorPicker } from '@tuturuuu/ui/color-picker';
import IconPicker, {
  getIconComponentByKey,
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
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { toast } from '@tuturuuu/ui/sonner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { computeAccessibleLabelStyles } from '@tuturuuu/utils/label-colors';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import * as z from 'zod';

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

/**
 * Generates a random hex color
 */
function generateRandomColor(): string {
  const hue = Math.floor(Math.random() * 360);
  const saturation = Math.floor(Math.random() * 40) + 50; // 50-90%
  const lightness = Math.floor(Math.random() * 30) + 40; // 40-70%

  // Convert HSL to hex
  const h = hue / 360;
  const s = saturation / 100;
  const l = lightness / 100;

  const hueToRgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hueToRgb(p, q, h + 1 / 3) * 255);
  const g = Math.round(hueToRgb(p, q, h) * 255);
  const b = Math.round(hueToRgb(p, q, h - 1 / 3) * 255);

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function TransactionCategoryForm({ wsId, data, onFinish }: Props) {
  const t = useTranslations();
  const queryClient = useQueryClient();

  const [loading, setLoading] = useState(false);

  // Local state for immediate UI updates
  const [localIcon, setLocalIcon] = useState<string | null>(data?.icon || null);
  const [localColor, setLocalColor] = useState<string | null>(
    data?.color || null
  );

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

  const watchedType = form.watch('type');

  // Handle icon change - update both local state and form
  const handleIconChange = useCallback(
    (value: string | null) => {
      setLocalIcon(value);
      form.setValue('icon', value);
    },
    [form]
  );

  // Handle color change - update both local state and form
  const handleColorChange = useCallback(
    (value: string | null) => {
      setLocalColor(value);
      form.setValue('color', value);
    },
    [form]
  );

  // Get the current icon component based on local state
  const CurrentIcon = localIcon
    ? (getIconComponentByKey(localIcon) ??
      (watchedType === 'EXPENSE' ? ArrowDownCircle : ArrowUpCircle))
    : watchedType === 'EXPENSE'
      ? ArrowDownCircle
      : ArrowUpCircle;

  // Compute styles for the icon picker trigger button based on local color
  const iconPickerStyles = useMemo(() => {
    if (localColor) {
      const colorStyles = computeAccessibleLabelStyles(localColor);
      if (colorStyles) {
        return {
          backgroundColor: colorStyles.bg,
          borderColor: colorStyles.border,
          color: colorStyles.text,
        } as React.CSSProperties;
      }
    }
    return undefined;
  }, [localColor]);

  // Use className for trigger - match the row display style (h-7 w-7 rounded-md)
  const iconPickerClassName = useMemo(() => {
    const baseClass = '!h-7 !w-7 !rounded-md !p-0';
    if (localColor) {
      // Custom color - styles applied via triggerStyle
      return baseClass;
    }
    // Default colors based on expense/income type
    return `${baseClass} ${
      watchedType === 'EXPENSE'
        ? 'border-dynamic-red/40 bg-dynamic-red/10 text-dynamic-red'
        : 'border-dynamic-green/40 bg-dynamic-green/10 text-dynamic-green'
    }`;
  }, [localColor, watchedType]);

  async function onSubmit(formData: z.infer<typeof FormSchema>) {
    setLoading(true);

    const res = await fetch(
      formData?.id
        ? `/api/workspaces/${wsId}/transactions/categories/${formData.id}`
        : `/api/workspaces/${wsId}/transactions/categories`,
      {
        method: formData?.id ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          is_expense: formData.type === 'EXPENSE',
          icon: formData.icon || null,
          color: formData.color || null,
        }),
      }
    );

    if (res.ok) {
      // Invalidate the transaction categories query to refresh the list
      await queryClient.invalidateQueries({
        queryKey: ['transaction-categories', wsId],
      });
      onFinish?.(formData);
    } else {
      setLoading(false);
      toast.error('Error creating category', {
        description: 'An error occurred while creating the category',
      });
    }
  }

  const handleRandomizeColor = () => {
    const newColor = generateRandomColor();
    handleColorChange(newColor);
  };

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
            render={() => (
              <FormItem>
                <FormLabel>
                  {t('transaction-category-data-table.icon')}
                </FormLabel>
                <FormControl>
                  <div className="flex items-center gap-2">
                    <IconPicker
                      value={localIcon}
                      onValueChange={handleIconChange}
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
                      triggerClassName={iconPickerClassName}
                      triggerStyle={iconPickerStyles}
                      renderIcon={<CurrentIcon className="h-4 w-4" />}
                    />
                    <span className="text-muted-foreground text-sm">
                      {localIcon ||
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
            render={() => (
              <FormItem>
                <FormLabel>
                  {t('transaction-category-data-table.color')}
                </FormLabel>
                <FormControl>
                  <div className="flex items-center gap-2">
                    <ColorPicker
                      value={localColor || '#6b7280'}
                      onChange={handleColorChange}
                      disabled={loading}
                    />
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={handleRandomizeColor}
                            disabled={loading}
                            className="h-10 w-10 shrink-0"
                          >
                            <Dices className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {t('transaction-category-data-table.randomize_color')}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <span className="text-muted-foreground text-sm">
                      {localColor ||
                        t('transaction-category-data-table.no_color')}
                    </span>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="h-2" />

        <div className="flex flex-col gap-2 md:flex-row">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading
              ? t('common.processing')
              : data?.id
                ? t('ws-transaction-categories.edit')
                : t('ws-transaction-categories.create')}
          </Button>

          {data?.id && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              asChild
              disabled={loading}
            >
              <Link
                href={`/${wsId}/finance/transactions?categoryIds=${data.id}`}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                {t('transaction-category-data-table.view_transactions')}
              </Link>
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
