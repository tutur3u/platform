'use client';

import { Separator } from '@repo/ui/components/ui/separator';
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

  // when scrolled down, remove bg-transparent and add bg-background
  // to the navbar-content's className
  useEffect(() => {
    const navbarContent = document.getElementById('navbar-content');
    if (!navbarContent) return;

    if (scroll > 0) {
      navbarContent.classList.remove('bg-transparent');
      navbarContent.classList.add('bg-background/50');
    } else {
      navbarContent.classList.remove('bg-background/50');
      navbarContent.classList.add('bg-transparent');
    }
  }, [scroll]);

  const forceShow = pathname.startsWith('/docs');

  return (
    <Separator
      className={`${forceShow || scroll > 0 ? 'opacity-100' : 'opacity-0'} transition duration-300`}
    />
  );
}
