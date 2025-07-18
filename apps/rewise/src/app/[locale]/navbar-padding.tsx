import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

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
      <div className="relative">{children}</div>
    </>
  );
}
