'use client';

import { CommonFooter } from '@tuturuuu/ui/custom/common-footer';
import { useTranslations } from 'next-intl';
import { DEV_MODE } from '@/constants/common';

export default function Footer() {
  const t = useTranslations();
  return <CommonFooter t={t} devMode={DEV_MODE} />;
}
