'use client';

import { CommonFooter } from '@tuturuuu/ui/custom/common-footer';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { DEV_MODE } from '@/constants/common';

export default function Footer() {
  const t = useTranslations();
  const pathname = usePathname();
  if (pathname.startsWith('/login')) return null;
  return <CommonFooter t={t} devMode={DEV_MODE} />;
}
