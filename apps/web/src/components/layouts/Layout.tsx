import { FC } from 'react';
import dynamic from 'next/dynamic';
import { User } from '../../types/primitives/User';
import { useUser } from '@supabase/auth-helpers-react';

interface LayoutProps {
  user?: User;
  hideNavbar?: boolean;
  hideNavLinks?: boolean;
  hideFooter?: boolean;
  hideSlogan?: boolean;
  children: React.ReactNode;
}

const DefaultLayout = dynamic(() => import('./DefaultLayout'), { ssr: false });
const SidebarLayout = dynamic(() => import('./SidebarLayout'), { ssr: false });

const Layout: FC<LayoutProps> = ({
  user,
  hideNavbar,
  hideNavLinks,
  hideFooter,
  hideSlogan,
  children,
}: LayoutProps) => {
  const clientUser = useUser();

  return user ?? clientUser ? (
    <SidebarLayout>{children}</SidebarLayout>
  ) : (
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
