'use client';

import { Separator } from '@tuturuuu/ui/separator';
import { useEffect, useState } from 'react';

export default function NavbarSeparator() {
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
      navbarContent.classList.add('bg-background/80');
      navbarContent.classList.add('backdrop-blur-xl');
    } else {
      navbarContent.classList.remove('bg-background/80');
      navbarContent.classList.remove('backdrop-blur-xl');
      navbarContent.classList.add('bg-transparent');
    }
  }, [scroll]);

  return (
    <Separator
      className={`${scroll > 0 ? 'opacity-100' : 'opacity-0'} transition duration-300`}
    />
  );
}
