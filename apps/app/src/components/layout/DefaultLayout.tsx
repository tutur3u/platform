import { FC } from 'react';
import Navbar from './Navbar';
import Footer from './Footer';

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
  return (
    <div className="relative">
      {hideNavbar || <Navbar hideNavLinks={hideNavLinks} />}
      <div className="relative min-h-screen">{children}</div>
      {hideFooter || <Footer hideSlogan={hideSlogan} />}
    </div>
  );
};

export default DefaultLayout;
