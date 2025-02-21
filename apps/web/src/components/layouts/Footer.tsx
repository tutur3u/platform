'use client';

import { CommonFooter } from '@tutur3u/ui/custom/common-footer';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';

export default function Footer() {
  const pathname = usePathname();
  const t = useTranslations();

  if (pathname.endsWith('/pitch')) return null;
  return <CommonFooter t={t} />;
}
