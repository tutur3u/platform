'use client';

import { CommonFooter } from '@tutur3u/ui/custom/common-footer';
import { useTranslations } from 'next-intl';

export default function Footer() {
  const t = useTranslations();
  return <CommonFooter t={t} />;
}
