import Footer from './Footer';
import type React from 'react';
import type { FC } from 'react';

interface DefaultLayoutProps {
  children: React.ReactNode;
}

const DefaultLayout: FC<DefaultLayoutProps> = ({
  children,
}: DefaultLayoutProps) => {
  return (
    <>
      <div className="relative min-h-screen">{children}</div>
      <Footer />
    </>
  );
};

export default DefaultLayout;
