import { FC } from 'react';
import Navbar from './Navbar';
import Footer from './Footer';

interface LayoutProps {
  hideSlogan?: boolean;
  children: React.ReactNode;
}

const Layout: FC<LayoutProps> = ({ hideSlogan, children }: LayoutProps) => {
  return (
    <div className="relative">
      <Navbar />
      <div className="relative min-h-screen">{children}</div>
      <Footer hideSlogan={hideSlogan} />
    </div>
  );
};

export default Layout;
