'use client';

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import type { UseFormReturn } from '@tuturuuu/ui/hooks/use-form';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import type { WalletFormValues } from './form';
import { WalletIconImagePicker } from './wallet-icon-image-picker';

interface WalletBasicsFieldsProps {
  defaultIcon?: string | null;
  defaultImageSrc?: string | null;
  form: UseFormReturn<WalletFormValues>;
  loading: boolean;
}

export function WalletBasicsFields({
  defaultIcon,
  defaultImageSrc,
  form,
  loading,
}: WalletBasicsFieldsProps) {
  const t = useTranslations();
  const [localIcon, setLocalIcon] = useState<string | null>(
    defaultIcon || null
  );
  const [localImageSrc, setLocalImageSrc] = useState<string | null>(
    defaultImageSrc || null
  );

  const handleIconChange = useCallback(
    (value: string | null) => {
      setLocalIcon(value);
      form.setValue('icon', value);
    },
    [form]
  );

  const handleImageSrcChange = useCallback(
    (value: string | null) => {
      setLocalImageSrc(value);
      form.setValue('image_src', value);
    },
    [form]
  );

  return (
    <>
      <div className="flex items-end gap-2">
        <FormField
          control={form.control}
          name="icon"
          render={() => (
            <FormItem>
              <FormLabel>{t('wallet-data-table.icon')}</FormLabel>
              <FormControl>
                <WalletIconImagePicker
                  icon={localIcon}
                  imageSrc={localImageSrc}
                  onIconChange={handleIconChange}
                  onImageSrcChange={handleImageSrcChange}
                  disabled={loading}
                  translations={{
                    selectIconOrImage: t(
                      'wallet-data-table.select_icon_or_image'
                    ),
                    iconTab: t('wallet-data-table.icon_tab'),
                    bankTab: t('wallet-data-table.bank_tab'),
                    mobileTab: t('wallet-data-table.mobile_tab'),
                    searchPlaceholder: t('wallet-data-table.search'),
                    clear: t('common.clear'),
                    selectIcon: t('wallet-data-table.select_icon'),
                    iconDescription: t('wallet-data-table.icon_description'),
                    changeIconOrImageDescription: t(
                      'wallet-data-table.change_icon_or_image_description'
                    ),
                    chooseIconOrImageDescription: t(
                      'wallet-data-table.choose_icon_or_image_description'
                    ),
                    searchIcons: t('wallet-data-table.search_icons'),
                    noIcon: t('wallet-data-table.no_icon'),
                    banksAvailable: (count) =>
                      t('wallet-data-table.banks_available', { count }),
                    mobileProvidersAvailable: (count) =>
                      t('wallet-data-table.mobile_providers_available', {
                        count,
                      }),
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="name"
          disabled={loading}
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormLabel>{t('wallet-data-table.wallet_name')}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t('wallet-data-table.wallet_name_placeholder')}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="description"
        disabled={loading}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('wallet-data-table.description')}</FormLabel>
            <FormControl>
              <Input
                placeholder={t('wallet-data-table.description_placeholder')}
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}
