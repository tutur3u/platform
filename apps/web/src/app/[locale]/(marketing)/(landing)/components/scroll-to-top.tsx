'use client';

import { ChevronUp } from '@tuturuuu/ui/icons';
import { useEffect, useState } from 'react';

export function ScrollToTop() {
  const [isVisible, setIsVisible] = useState(false);

  const toggleVisibility = () => {
    if (window.scrollY > 300) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  };

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  useEffect(() => {
    window.addEventListener('scroll', toggleVisibility);
    return () => window.removeEventListener('scroll', toggleVisibility);
  }, []);

  return (
    <button
      onClick={scrollToTop}
      className={`bg-foreground text-background hover:bg-foreground/80 fixed bottom-6 right-6 rounded-full p-3 shadow-lg transition-opacity duration-300 ${
        isVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
      aria-label="Scroll to top"
    >
      <ChevronUp className="h-6 w-6" />
    </button>
  );
}
