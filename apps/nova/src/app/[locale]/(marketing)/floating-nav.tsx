import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import { Crown, Star, Target } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function FloatingNav() {
  const [activeSection, setActiveSection] = useState('hero');
  const [isVisible, setIsVisible] = useState(false);

  const sections = [
    { id: 'hero', icon: Star, label: 'Top' },
    { id: 'neo-league', icon: Crown, label: 'NEO League' },
    { id: 'features', icon: Target, label: 'Features' },
  ];

  useEffect(() => {
    const handleScroll = () => {
      // Show nav after scrolling past 200px
      setIsVisible(window.scrollY > 200);

      // Update active section based on scroll position
      const sectionElements = sections.map((section) => ({
        id: section.id,
        element: document.getElementById(section.id),
      }));

      const currentSection = sectionElements.find(({ element }) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        return rect.top <= 100 && rect.bottom >= 100;
      });

      if (currentSection) {
        setActiveSection(currentSection.id);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [sections]);

  return (
    <motion.nav
      initial={{ opacity: 0, x: 50 }}
      animate={{
        opacity: isVisible ? 1 : 0,
        x: isVisible ? 0 : 50,
      }}
      transition={{ duration: 0.3 }}
      className="fixed top-1/2 right-4 z-50 hidden -translate-y-1/2 space-y-2 md:block"
    >
      {sections.map(({ id, icon: Icon, label }) => (
        <motion.button
          key={id}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
          }}
          className={cn(
            'group relative flex h-12 w-12 items-center justify-center rounded-full bg-background/80 shadow-lg backdrop-blur-sm transition-colors',
            activeSection === id
              ? 'text-primary'
              : 'text-muted-foreground hover:text-primary'
          )}
          aria-label={`Navigate to ${label} section`}
        >
          <Icon className="h-5 w-5" />
          <span className="absolute right-full mr-2 hidden rounded-md bg-background/80 px-2 py-1 text-sm backdrop-blur-sm group-hover:block">
            {label}
          </span>
        </motion.button>
      ))}
    </motion.nav>
  );
}
