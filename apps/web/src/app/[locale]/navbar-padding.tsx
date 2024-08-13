import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface Props {
  onlyOnMobile?: boolean;
  children: ReactNode;
}

export default function NavbarPadding({
  onlyOnMobile = false,
  children,
}: Props) {
  const navbarHeight = 66;

  return (
    <>
      <div
        style={{ height: `${navbarHeight}px` }}
        className={cn(onlyOnMobile ? 'md:hidden' : '')}
      />
      <div style={{ paddingTop: `${navbarHeight}px` }} className="relative">
        {children}
      </div>
    </>
  );
}
