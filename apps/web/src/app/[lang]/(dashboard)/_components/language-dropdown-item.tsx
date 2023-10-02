'use client';

import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import useTranslation from 'next-translate/useTranslation';
import { useRouter } from 'next/navigation';

interface Props {
  label: string;
  locale?: string;
  disabled?: boolean;
}

export function LanguageDropdownItem({ label, locale, disabled }: Props) {
  const { t } = useTranslation('common');
  const router = useRouter();

  const useDefaultLocale = async () => {
    const res = await fetch('/api/languages', {
      method: 'DELETE',
    });

    if (res.ok) router.refresh();
  };

  const useLocale = async () => {
    const res = await fetch('/api/languages', {
      method: 'POST',
      body: JSON.stringify({ locale }),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (res.ok) router.refresh();
  };

  return (
    <DropdownMenuItem
      className="cursor-pointer"
      onClick={locale ? useLocale : useDefaultLocale}
      disabled={disabled}
    >
      {locale ? label : t('system')}
    </DropdownMenuItem>
  );
}
