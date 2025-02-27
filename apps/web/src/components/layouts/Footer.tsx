'use client';

import { DEV_MODE } from '@/constants/common';
import { CommonFooter } from '@tuturuuu/ui/custom/common-footer';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';

export default function Footer() {
  const pathname = usePathname();
  const t = useTranslations();

  if (pathname.endsWith('/pitch')) return null;
  return <CommonFooter t={t} devMode={DEV_MODE} />;
}
