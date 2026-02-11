'use client';

import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { Label } from '@tuturuuu/ui/label';
import { RadioGroup, RadioGroupItem } from '@tuturuuu/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useTransition } from 'react';

/**
 * Shared appearance settings with theme and language.
 * For app-specific extensions (e.g., calendar timezone settings),
 * wrap or extend this component in your app.
 */
export function AppearanceSettings() {
  const t = useTranslations();
  const { theme, setTheme } = useTheme();
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleLocaleChange = async (newLocale: string) => {
    const res = await fetch('/api/v1/infrastructure/languages', {
      method: 'POST',
      body: JSON.stringify({ locale: newLocale }),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (res.ok) {
      startTransition(() => {
        router.refresh();
      });
    }
  };

  return (
    <div className="space-y-8">
      <SettingItemTab
        title={t('common.theme')}
        description="Select your preferred theme for the application."
      >
        <RadioGroup
          defaultValue={theme}
          onValueChange={setTheme}
          className="grid grid-cols-3 gap-4"
        >
          <div>
            <RadioGroupItem value="light" id="light" className="peer sr-only" />
            <Label
              htmlFor="light"
              className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
            >
              <div className="mb-3 h-20 w-full rounded-md bg-[#ecedef] shadow-sm" />
              {t('common.light')}
            </Label>
          </div>
          <div>
            <RadioGroupItem value="dark" id="dark" className="peer sr-only" />
            <Label
              htmlFor="dark"
              className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
            >
              <div className="mb-3 h-20 w-full rounded-md bg-slate-950 shadow-sm" />
              {t('common.dark')}
            </Label>
          </div>
          <div>
            <RadioGroupItem
              value="system"
              id="system"
              className="peer sr-only"
            />
            <Label
              htmlFor="system"
              className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
            >
              <div className="mb-3 h-20 w-full rounded-md bg-linear-to-r from-[#ecedef] to-slate-950 shadow-sm" />
              {t('common.system')}
            </Label>
          </div>
        </RadioGroup>
      </SettingItemTab>

      <Separator />

      <SettingItemTab
        title={t('common.language')}
        description={t('settings-account.language-description')}
      >
        <Select
          defaultValue={locale}
          onValueChange={handleLocaleChange}
          disabled={isPending}
        >
          <SelectTrigger className="w-50">
            <SelectValue placeholder={t('common.select-language')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="vi">Tieng Viet</SelectItem>
          </SelectContent>
        </Select>
      </SettingItemTab>
    </div>
  );
}
