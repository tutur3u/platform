import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export default function FloatingNav() {
  const [activeSection, setActiveSection] = useState('hero');
  const [isVisible, setIsVisible] = useState(false);

  const sections = [
    { id: 'hero', label: 'Top' },
    { id: 'neo-league', label: 'NEO League' },
    { id: 'features', label: 'Features' },
    { id: 'learning', label: 'Learning' },
    { id: 'ai', label: 'AI Features' },
  ];

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { threshold: 0.5 }
    );

    sections.forEach(({ id }) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });

    const handleScroll = () => {
      setIsVisible(window.scrollY > 100);
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll();

    return () => {
      sections.forEach(({ id }) => {
        const element = document.getElementById(id);
        if (element) observer.unobserve(element);
      });
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const scrollTo = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: isVisible ? 1 : 0, y: isVisible ? 0 : 20 }}
      className="fixed top-1/2 right-4 z-50 -translate-y-1/2 space-y-2"
    >
      {sections.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => scrollTo(id)}
          className="group relative flex items-center"
          aria-label={`Scroll to ${label}`}
        >
          <span className="absolute right-full mr-2 hidden rounded-md bg-background/80 px-2 py-1 text-sm backdrop-blur-sm group-hover:block">
            {label}
          </span>
          <div
            className={cn(
              'h-2 w-2 rounded-full transition-all',
              activeSection === id
                ? 'shadow-glow bg-primary'
                : 'bg-primary/20 group-hover:bg-primary/50'
            )}
          />
        </button>
      ))}
    </motion.div>
  );
}
