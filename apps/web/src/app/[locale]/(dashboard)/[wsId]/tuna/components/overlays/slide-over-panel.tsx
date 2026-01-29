'use client';

import { X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { AnimatePresence, motion } from 'framer-motion';

interface SlideOverPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function SlideOverPanel({
  isOpen,
  onClose,
  title,
  children,
  className,
}: SlideOverPanelProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            className={cn(
              'fixed top-0 right-0 z-50 h-full',
              'w-full max-w-md md:max-w-lg',
              'bg-background/95 backdrop-blur-xl',
              'border-border/30 border-l',
              'shadow-2xl',
              'flex flex-col',
              className
            )}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-border/30 border-b px-4 py-3 md:px-6 md:py-4">
              {title && <h2 className="font-semibold text-lg">{title}</h2>}
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="ml-auto"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
