'use client';

import { Separator } from '@tutur3u/ui/components/ui/separator';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function NavbarSeparator() {
  const pathname = usePathname();
  const [scroll, setScroll] = useState(0);

  useEffect(() => {
    const mainContentElement = document.getElementById('main-content');

    const handleScroll = () => {
      if (mainContentElement) {
        setScroll(mainContentElement.scrollTop);
      }
    };

    // Set initial scroll value
    handleScroll();

    // Add event listener
    if (mainContentElement) {
      mainContentElement.addEventListener('scroll', handleScroll);
    }

    // Remove event listener
    return () => {
      if (mainContentElement) {
        mainContentElement.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  const forceShow = pathname.startsWith('/docs');

  return (
    <Separator
      className={`${forceShow || scroll > 0 ? 'opacity-100' : 'opacity-0'} transition duration-300`}
    />
  );
}
