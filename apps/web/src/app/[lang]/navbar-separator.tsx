'use client';

import { Separator } from '@/components/ui/separator';
import { useEffect, useState } from 'react';

export default function NavbarSeparator() {
  const [scroll, setScroll] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScroll(window.scrollY);

    // Set initial scroll value
    handleScroll();

    // Add event listener
    window.addEventListener('scroll', handleScroll);

    // Remove event listener
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <Separator
      className={`${scroll > 0 ? 'opacity-100' : 'opacity-0'} transition duration-300`}
    />
  );
}
