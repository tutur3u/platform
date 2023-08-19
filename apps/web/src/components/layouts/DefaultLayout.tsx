import { FC } from 'react';
import Footer from './Footer';

interface DefaultLayoutProps {
  hideNavbar?: boolean;
  hideNavLinks?: boolean;
  hideFooter?: boolean;
  hideSlogan?: boolean;
  children: React.ReactNode;
}

const DefaultLayout: FC<DefaultLayoutProps> = ({
  hideFooter,
  hideSlogan,
  children,
}: DefaultLayoutProps) => {
  return (
    <div className="relative">
      <div className="relative min-h-screen">{children}</div>
      {hideFooter || <Footer hideSlogan={hideSlogan} />}
    </div>
  );
};

export default DefaultLayout;
