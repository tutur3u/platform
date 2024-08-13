'use client';

import { usePathname } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';

interface Props {
  onlyOnMobile?: boolean;
  children: ReactNode;
}

export default function NavbarPadding({
  onlyOnMobile = false,
  children,
}: Props) {
  const pathname = usePathname();

  const defaultHeight = 66;
  const [navbarHeight, setNavbarHeight] = useState(defaultHeight);

  useEffect(() => {
    if (pathname === '/') return;

    const navbar = document.getElementById('navbar');
    const height = navbar?.clientHeight || defaultHeight;

    setNavbarHeight(height);
  }, [pathname]);

  return (
    <>
      <div
        style={{ height: `${navbarHeight}px` }}
        className={onlyOnMobile ? 'md:hidden' : ''}
      />
      <main className="relative">{children}</main>
    </>
  );
}
