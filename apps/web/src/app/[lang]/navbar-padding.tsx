'use client';

import { usePathname } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';

interface Props {
  children: ReactNode;
}

export default function NavbarPadding({ children }: Props) {
  const pathname = usePathname();

  const defaultHeight = 56;
  const [navbarHeight, setNavbarHeight] = useState(defaultHeight);

  useEffect(() => {
    if (pathname === '/') return;

    const navbar = document.getElementById('navbar');
    const height = navbar?.clientHeight ?? defaultHeight;

    setNavbarHeight(height);
  }, [pathname]);

  return (
    <>
      <div
        className={`${pathname === '/login' ? 'flex' : ''}`}
        style={{ height: navbarHeight }}
      />
      <main
        style={{
          height: `calc(100vh - ${navbarHeight}px)`,
        }}
      >
        {children}
      </main>
    </>
  );
}
