import { Sparkles } from '@tuturuuu/ui/icons';
import { AnimatePresence, motion } from 'framer-motion';

interface ToastNotificationProps {
  isVisible: boolean;
  message: string;
  onClose: () => void;
}

export default function ToastNotification({
  isVisible,
  message,
  onClose,
}: ToastNotificationProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 50, x: '-50%' }}
          animate={{ opacity: 1, y: 0, x: '-50%' }}
          exit={{ opacity: 0, y: -20, x: '-50%' }}
          className="border-primary/20 bg-primary/10 text-primary fixed left-1/2 top-4 z-50 flex items-center gap-2 rounded-lg border px-4 py-2 shadow-lg backdrop-blur-sm"
        >
          <Sparkles className="h-5 w-5 animate-pulse" />
          <span className="text-sm font-medium">{message}</span>
          <motion.div
            className="bg-primary absolute bottom-0 left-0 h-[2px]"
            initial={{ width: '100%' }}
            animate={{ width: '0%' }}
            transition={{ duration: 5 }}
            onAnimationComplete={onClose}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
