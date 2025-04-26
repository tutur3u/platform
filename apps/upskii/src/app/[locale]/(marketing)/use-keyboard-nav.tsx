import { useEffect, useState } from 'react';

interface Section {
  id: string;
  label: string;
}

export function useKeyboardNav(sections: Section[]) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isNavigating, setIsNavigating] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        setIsNavigating(true);
      }

      if (!isNavigating) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setCurrentIndex((prev) =>
            prev < sections.length - 1 ? prev + 1 : prev
          );
          document
            .getElementById(sections[currentIndex + 1]?.id || '')
            ?.scrollIntoView({ behavior: 'smooth' });
          break;

        case 'ArrowUp':
          e.preventDefault();
          setCurrentIndex((prev) => (prev > 0 ? prev - 1 : prev));
          document
            .getElementById(sections[currentIndex - 1]?.id || '')
            ?.scrollIntoView({ behavior: 'smooth' });
          break;

        case 'Home':
          e.preventDefault();
          setCurrentIndex(0);
          document
            .getElementById(sections[0]?.id || '')
            ?.scrollIntoView({ behavior: 'smooth' });
          break;

        case 'End':
          e.preventDefault();
          setCurrentIndex(sections.length - 1);
          document
            .getElementById(sections[sections.length - 1]?.id || '')
            ?.scrollIntoView({ behavior: 'smooth' });
          break;
      }
    };

    const handleMouseMove = () => {
      setIsNavigating(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [sections, currentIndex, isNavigating]);

  return {
    currentIndex,
    isNavigating,
    setCurrentIndex,
  };
}
