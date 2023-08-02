import { FC } from 'react';
import Navbar from './Navbar';
import Footer from './Footer';
import { useUser } from '../../hooks/useUser';

interface DefaultLayoutProps {
  hideNavbar?: boolean;
  hideNavLinks?: boolean;
  hideFooter?: boolean;
  hideSlogan?: boolean;
  children: React.ReactNode;
}

const DefaultLayout: FC<DefaultLayoutProps> = ({
  hideNavbar,
  hideNavLinks,
  hideFooter,
  hideSlogan,
  children,
}: DefaultLayoutProps) => {
  const { user } = useUser();

  return (
    <div className="relative">
      {hideNavbar || <Navbar user={user} hideNavLinks={hideNavLinks} />}
      <div className="relative min-h-screen">{children}</div>
      {hideFooter || <Footer hideSlogan={hideSlogan} />}
    </div>
  );
};

export default DefaultLayout;
