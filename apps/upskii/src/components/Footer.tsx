'use client';

import { DEV_MODE } from '@/constants/common';
import { CommonFooter } from '@tuturuuu/ui/custom/common-footer';
import { useTranslations } from 'next-intl';

export default function Footer() {
  const t = useTranslations();
  return <CommonFooter t={t} devMode={DEV_MODE} />;
}
