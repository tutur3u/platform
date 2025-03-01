import { Button } from '@tuturuuu/ui/button';
import { motion } from 'framer-motion';
import { ArrowUpIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function ScrollToTop() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY > window.innerHeight);
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: isVisible ? 1 : 0, scale: isVisible ? 1 : 0.8 }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      className="fixed bottom-4 left-4 z-50"
    >
      <Button
        size="icon"
        variant="outline"
        onClick={scrollToTop}
        className="h-10 w-10 rounded-full bg-background/80 backdrop-blur-sm"
        aria-label="Scroll to top"
      >
        <ArrowUpIcon className="h-5 w-5" />
      </Button>
    </motion.div>
  );
}
