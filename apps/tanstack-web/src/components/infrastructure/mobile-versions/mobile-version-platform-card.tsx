import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { Input } from '@tuturuuu/ui/input';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import type { UseFormReturn } from 'react-hook-form';
import type {
  MobileVersionFormValues,
  MobileVersionPlatform,
} from './mobile-version-form-utils';

interface MobileVersionPlatformCardProps {
  form: UseFormReturn<MobileVersionFormValues>;
  platform: MobileVersionPlatform;
}

export function MobileVersionPlatformCard({
  form,
  platform,
}: MobileVersionPlatformCardProps) {
  const t = useTranslations('mobile-version-settings');

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-6">
      <div className="space-y-1">
        <h2 className="font-semibold text-lg">{t(`${platform}.title`)}</h2>
        <p className="text-muted-foreground text-sm">
          {t(`${platform}.description`)}
        </p>
      </div>

      <FormField
        control={form.control}
        name={`${platform}.otpEnabled` as const}
        render={({ field }) => (
          <FormItem className="rounded-xl border border-border/60 bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <FormLabel>{t('fields.otp_enabled')}</FormLabel>
                <FormDescription>
                  {t('fields.otp_enabled_description', {
                    platform: t(`${platform}.title`),
                  })}
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </div>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={`${platform}.effectiveVersion` as const}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('fields.effective_version')}</FormLabel>
            <FormControl>
              <Input {...field} placeholder={t('fields.version_placeholder')} />
            </FormControl>
            <FormDescription>
              {t('fields.effective_version_description')}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={`${platform}.minimumVersion` as const}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('fields.minimum_version')}</FormLabel>
            <FormControl>
              <Input {...field} placeholder={t('fields.version_placeholder')} />
            </FormControl>
            <FormDescription>
              {t('fields.minimum_version_description')}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={`${platform}.storeUrl` as const}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('fields.store_url')}</FormLabel>
            <FormControl>
              <Input
                {...field}
                placeholder={t('fields.store_url_placeholder')}
              />
            </FormControl>
            <FormDescription>
              {t('fields.store_url_description')}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
