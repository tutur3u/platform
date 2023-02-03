import { FC } from 'react';
import Navbar from './Navbar';
import Footer from './Footer';

interface DefaultLayoutProps {
  hideSlogan?: boolean;
  children: React.ReactNode;
}

const DefaultLayout: FC<DefaultLayoutProps> = ({
  hideSlogan,
  children,
}: DefaultLayoutProps) => {
  return (
    <div className="relative">
      <Navbar />
      <div className="relative min-h-screen">{children}</div>
      <Footer hideSlogan={hideSlogan} />
    </div>
  );
};

export default DefaultLayout;
