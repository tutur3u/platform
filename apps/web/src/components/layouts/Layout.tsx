import { FC } from 'react';
import { useUser } from '@supabase/auth-helpers-react';
import dynamic from 'next/dynamic';

interface LayoutProps {
  hideNavbar?: boolean;
  hideNavLinks?: boolean;
  hideFooter?: boolean;
  hideSlogan?: boolean;
  children: React.ReactNode;
}

const DefaultLayout = dynamic(() => import('./DefaultLayout'), {
  ssr: false,
});

const SidebarLayout = dynamic(() => import('./SidebarLayout'), {
  ssr: false,
});

const Layout: FC<LayoutProps> = ({
  hideNavbar,
  hideNavLinks,
  hideFooter,
  hideSlogan,
  children,
}: LayoutProps) => {
  const user = useUser();

  if (user) return <SidebarLayout>{children}</SidebarLayout>;

  return (
    <DefaultLayout
      hideNavbar={hideNavbar}
      hideNavLinks={hideNavLinks}
      hideFooter={hideFooter}
      hideSlogan={hideSlogan}
    >
      {children}
    </DefaultLayout>
  );
};

export default Layout;
