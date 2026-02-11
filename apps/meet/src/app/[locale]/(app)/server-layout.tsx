import { CommonFooter } from '@tuturuuu/ui/custom/common-footer';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { getTranslations } from 'next-intl/server';

export default async function ServerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
