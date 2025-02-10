'use client';

import { Separator } from '@tutur3u/ui/components/ui/separator';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function NavbarSeparator() {
  const pathname = usePathname();
  const [scroll, setScroll] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setScroll(window.scrollY);
    };

    // Set initial scroll value
    handleScroll();

    // Add event listener
    window.addEventListener('scroll', handleScroll);

    // Remove event listener
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const forceShow = pathname.startsWith('/docs');

  return (
    <Separator
      className={`${forceShow || scroll > 0 ? 'opacity-100' : 'opacity-0'} transition duration-300`}
    />
  );
}
