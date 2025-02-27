import { AnimatePresence, motion } from 'framer-motion';
import { KeyboardIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function KeyboardGuide() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '?') {
        e.preventDefault();
        setIsVisible((prev) => !prev);
      } else if (e.key === 'Escape') {
        setIsVisible(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const shortcuts = [
    { key: '↑/↓', description: 'Navigate between sections' },
    { key: 'Home', description: 'Go to top' },
    { key: 'End', description: 'Go to bottom' },
    { key: 'Tab', description: 'Enable keyboard navigation' },
    { key: 'Esc', description: 'Close this guide' },
    { key: '?', description: 'Toggle keyboard shortcuts' },
  ];

  return (
    <>
      <button
        onClick={() => setIsVisible(true)}
        className="fixed right-4 bottom-4 z-50 hidden rounded-full bg-primary/10 p-3 backdrop-blur-sm transition-transform hover:scale-110 md:block"
        aria-label="Show keyboard shortcuts"
      >
        <KeyboardIcon className="h-5 w-5" />
      </button>

      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
            onClick={() => setIsVisible(false)}
          >
            <motion.div
              initial={{ y: 20 }}
              animate={{ y: 0 }}
              className="relative w-full max-w-lg rounded-lg border border-primary/10 bg-background p-6 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="mb-4 text-xl font-bold">Keyboard Shortcuts</h2>
              <div className="space-y-3">
                {shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.key}
                    className="flex items-center justify-between"
                  >
                    <span className="text-muted-foreground">
                      {shortcut.description}
                    </span>
                    <kbd className="rounded bg-primary/10 px-2 py-1 font-mono text-sm">
                      {shortcut.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
