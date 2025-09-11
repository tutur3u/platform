import { CommonFooter } from '@tuturuuu/ui/custom/common-footer';
import { getTranslations } from 'next-intl/server';
import type React from 'react';
import { DEV_MODE } from '@/constants/common';

interface LayoutProps {
  children: React.ReactNode;
}

export default async function Layout({ children }: LayoutProps) {
  const t = await getTranslations();
  return (
    <>
      {/* <Navbar hideMetadata /> */}
      <div id="main-content" className="flex flex-col pt-[53px]">
        {children}
      </div>
      <CommonFooter t={t} devMode={DEV_MODE} />
    </>
  );
}
