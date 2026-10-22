import { CommonFooter } from '@tuturuuu/ui/custom/common-footer';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

export function PublicLayout({ children }: { children: ReactNode }) {
  const t = useTranslations();
  return (
    <>
      <div id="main-content" className="flex flex-col pt-[53px]">
        {children}
      </div>
      <CommonFooter t={t} devMode={DEV_MODE} />
    </>
  );
}
