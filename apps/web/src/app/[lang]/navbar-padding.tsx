'use client';

import { usePathname } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';

interface Props {
  children: ReactNode;
}

export default function NavbarPadding({ children }: Props) {
  const pathname = usePathname();

  const defaultHeight = 57;
  const [navbarHeight, setNavbarHeight] = useState(defaultHeight);

  useEffect(() => {
    if (pathname === '/') return;

    const navbar = document.getElementById('navbar');
    const height = navbar?.clientHeight ?? defaultHeight;

    setNavbarHeight(height);
  }, [pathname]);

  return (
    <div
      className={`min-h-screen ${pathname === '/login' ? 'flex' : ''}`}
      style={{ paddingTop: navbarHeight }}
    >
      {children}
    </div>
  );
}
