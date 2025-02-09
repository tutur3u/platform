'use client';

import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

interface Props {
  onlyOnMobile?: boolean;
}

export default function NavbarPadding({ onlyOnMobile = false }: Props) {
  const [navbarHeight, setNavbarHeight] = useState(0);

  useEffect(() => {
    const navbarElement = document.getElementById('navbar');

    const handleHeight = () => {
      if (navbarElement) {
        setNavbarHeight(navbarElement.clientHeight);
      }
    };

    handleHeight();

    window.addEventListener('resize', handleHeight);

    return () => {
      window.removeEventListener('resize', handleHeight);
    };
  }, []);

  return (
    <div
      style={{ height: `${navbarHeight}px` }}
      className={cn(onlyOnMobile ? 'md:hidden' : '')}
    />
  );
}
