'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDownCircle, ArrowUpCircle, Loader2 } from '@tuturuuu/icons';
import type { TransactionCategory } from '@tuturuuu/types/primitives/TransactionCategory';
import { Button } from '@tuturuuu/ui/button';
import { Combobox, type ComboboxOption } from '@tuturuuu/ui/custom/combobox';
import {
  getIconComponentByKey,
  type PlatformIconKey,
} from '@tuturuuu/ui/custom/icon-picker';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import {
  SettingsSection,
  SettingsSectionFooter,
} from '@tuturuuu/ui/custom/settings-section';
import { useWorkspaceConfigs } from '@tuturuuu/ui/hooks/use-workspace-config';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useTransactionCategories } from '@/hooks/use-transaction-categories';

interface Props {
  workspaceId: string;
}

const NONE_OPTION = 'none';

const CONFIG_KEYS = [
  'debt_category_id',
  'loan_category_id',
  'repayment_category_id',
  'debt_collection_category_id',
] as const;

type ConfigKey = (typeof CONFIG_KEYS)[number];

const hasSameConfigValues = (
  left: Record<ConfigKey, string>,
  right: Record<ConfigKey, string>
) => CONFIG_KEYS.every((key) => left[key] === right[key]);

function getCategoryIcon(category: TransactionCategory): React.ReactNode {
  if (category.icon) {
    const IconComponent = getIconComponentByKey(
      category.icon as PlatformIconKey
    );
    if (IconComponent) {
      return <IconComponent className="h-4 w-4" />;
    }
  }
  if (category.is_expense === false) {
    return <ArrowUpCircle className="h-4 w-4" />;
  }
  return <ArrowDownCircle className="h-4 w-4" />;
}

export default function DebtLoanSettings({ workspaceId }: Props) {
  const t = useTranslations('ws-debt-loan-settings');
  const tCategories = useTranslations('ws-transaction-categories');
  const { data: categories = [], isLoading: isLoadingCategories } =
    useTransactionCategories(workspaceId);
  const { data: configs, isLoading: isLoadingConfigs } = useWorkspaceConfigs(
    workspaceId,
    [...CONFIG_KEYS]
  );

  const queryClient = useQueryClient();

  const isLoading = isLoadingCategories || isLoadingConfigs;

  const [selectedValues, setSelectedValues] = useState<
    Record<ConfigKey, string>
  >({
    debt_category_id: NONE_OPTION,
    loan_category_id: NONE_OPTION,
    repayment_category_id: NONE_OPTION,
    debt_collection_category_id: NONE_OPTION,
  });
  const [initialValues, setInitialValues] = useState<Record<ConfigKey, string>>(
    {
      debt_category_id: NONE_OPTION,
      loan_category_id: NONE_OPTION,
      repayment_category_id: NONE_OPTION,
      debt_collection_category_id: NONE_OPTION,
    }
  );
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (isLoading || !configs) return;

    const newValues: Record<ConfigKey, string> = {
      debt_category_id: NONE_OPTION,
      loan_category_id: NONE_OPTION,
      repayment_category_id: NONE_OPTION,
      debt_collection_category_id: NONE_OPTION,
    };

    for (const key of CONFIG_KEYS) {
      const configValue = configs[key];
      const trimmed = String(configValue || '').trim();
      const categoryExists = categories.some((c) => c.id === trimmed);
      newValues[key] = categoryExists ? trimmed : NONE_OPTION;
    }

    setInitialValues((previous) =>
      hasSameConfigValues(previous, newValues) ? previous : newValues
    );
    if (!initialized) {
      setSelectedValues(newValues);
      setInitialized(true);
    }
  }, [isLoading, configs, categories, initialized]);

  const isDirty = CONFIG_KEYS.some(
    (key) => selectedValues[key] !== initialValues[key]
  );

  const updateMutation = useMutation({
    mutationFn: async () => {
      const promises = CONFIG_KEYS.map(async (key) => {
        const nextValue =
          selectedValues[key] && selectedValues[key] !== NONE_OPTION
            ? selectedValues[key]
            : '';
        const res = await fetch(
          `/api/v1/workspaces/${workspaceId}/settings/${key}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: nextValue }),
          }
        );

        if (!res.ok) {
          throw new Error(`Failed to update ${key}`);
        }

        return res.json();
      });

      return Promise.all(promises);
    },
    onSuccess: () => {
      setInitialValues({ ...selectedValues });
      queryClient.invalidateQueries({
        queryKey: ['workspace-configs', workspaceId],
      });
      toast.success(t('update_success'));
    },
    onError: () => {
      toast.error(t('update_error'));
    },
  });

  // Filter and convert categories for expense vs income
  // These hooks must be called before any early return
  const expenseOptions: ComboboxOption[] = useMemo(() => {
    const noneOption: ComboboxOption = {
      value: NONE_OPTION,
      label: t('no_category'),
    };
    const filteredCategories = categories
      .filter((c) => c.id && c.is_expense !== false)
      .map((category): ComboboxOption => ({
        value: category.id as string,
        label: category.name || tCategories('unnamed_category'),
        icon: getCategoryIcon(category),
      }));
    return [noneOption, ...filteredCategories];
  }, [categories, t, tCategories]);

  const incomeOptions: ComboboxOption[] = useMemo(() => {
    const noneOption: ComboboxOption = {
      value: NONE_OPTION,
      label: t('no_category'),
    };
    const filteredCategories = categories
      .filter((c) => c.id && c.is_expense === false)
      .map((category): ComboboxOption => ({
        value: category.id as string,
        label: category.name || tCategories('unnamed_category'),
        icon: getCategoryIcon(category),
      }));
    return [noneOption, ...filteredCategories];
  }, [categories, t, tCategories]);

  if (!initialized) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateMutation.mutate();
  }

  const handleValueChange = (key: ConfigKey, value: string) => {
    setSelectedValues((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  return (
    <SettingsSection>
      <form onSubmit={onSubmit}>
        {/* Debt Category - This is INCOME (money coming in when you borrow) */}
        <SettingItemTab
          title={t('debt_category')}
          description={t('debt_category_description')}
          controlWidth="lg"
        >
          <Combobox
            options={incomeOptions}
            selected={selectedValues.debt_category_id}
            onChange={(value) =>
              handleValueChange('debt_category_id', value as string)
            }
            placeholder={t('select_category')}
            searchPlaceholder={t('search_categories')}
            emptyText={t('no_categories_found')}
          />
        </SettingItemTab>

        {/* Loan Category - This is EXPENSE (money going out when you lend) */}
        <SettingItemTab
          title={t('loan_category')}
          description={t('loan_category_description')}
          controlWidth="lg"
        >
          <Combobox
            options={expenseOptions}
            selected={selectedValues.loan_category_id}
            onChange={(value) =>
              handleValueChange('loan_category_id', value as string)
            }
            placeholder={t('select_category')}
            searchPlaceholder={t('search_categories')}
            emptyText={t('no_categories_found')}
          />
        </SettingItemTab>

        {/* Repayment Category - This is an EXPENSE (paying back your debt) */}
        <SettingItemTab
          title={t('repayment_category')}
          description={t('repayment_category_description')}
          controlWidth="lg"
        >
          <Combobox
            options={expenseOptions}
            selected={selectedValues.repayment_category_id}
            onChange={(value) =>
              handleValueChange('repayment_category_id', value as string)
            }
            placeholder={t('select_category')}
            searchPlaceholder={t('search_categories')}
            emptyText={t('no_categories_found')}
          />
        </SettingItemTab>

        {/* Debt Collection Category - This is INCOME (receiving repayment from loans you gave) */}
        <SettingItemTab
          title={t('debt_collection_category')}
          description={t('debt_collection_category_description')}
          controlWidth="lg"
        >
          <Combobox
            options={incomeOptions}
            selected={selectedValues.debt_collection_category_id}
            onChange={(value) =>
              handleValueChange('debt_collection_category_id', value as string)
            }
            placeholder={t('select_category')}
            searchPlaceholder={t('search_categories')}
            emptyText={t('no_categories_found')}
          />
        </SettingItemTab>

        <SettingsSectionFooter>
          <Button
            type="submit"
            disabled={isLoading || updateMutation.isPending || !isDirty}
          >
            {updateMutation.isPending ? t('saving') : t('save')}
          </Button>
        </SettingsSectionFooter>
      </form>
    </SettingsSection>
  );
}
