'use client';

import { TUTURUUU_LOCAL_LOGO_URL } from '@tuturuuu/ui/custom/tuturuuu-logo';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { DEV_MODE } from '@/constants/common';

const CommonFooter = dynamic<{
  t: any;
  devMode: boolean;
  logoSrc?: string;
}>(
  () =>
    import('@tuturuuu/ui/custom/common-footer').then(
      (module) => module.CommonFooter
    ),
  { ssr: false }
);

export default function Footer() {
  const t = useTranslations();
  const pathname = usePathname();
  if (pathname.startsWith('/login')) return null;
  return (
    <CommonFooter t={t} devMode={DEV_MODE} logoSrc={TUTURUUU_LOCAL_LOGO_URL} />
  );
}
