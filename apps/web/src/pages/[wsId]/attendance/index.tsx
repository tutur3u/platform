import { ReactElement, useEffect } from 'react';
import HeaderX from '../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';
import NestedLayout from '../../../components/layouts/NestedLayout';
import { useSegments } from '../../../hooks/useSegments';
import UnderConstructionTag from '../../../components/common/UnderConstructionTag';

const ClassesPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();

  useEffect(() => {
    setRootSegment({
      content: 'Classes',
      href: '/finance',
    });
  }, [setRootSegment]);

  //   if (!DEV_MODE)
  return (
    <>
      <HeaderX label="Classes" />
      <UnderConstructionTag />
    </>
  );

  //   return (
  //     <>
  //       <HeaderX label="Classes" />
  //       <div className="flex-col p-6 flex h-full w-full"></div>
  //     </>
  //   );
};

ClassesPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout>{page}</NestedLayout>;
};

export default ClassesPage;
