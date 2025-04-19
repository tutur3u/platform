import LoadingIndicator from './loading-indicator';
import { motion } from 'framer-motion';

interface LoadingStateProps {
  message?: string;
}

export default function LoadingState({
  message = 'Loading...',
}: LoadingStateProps) {
  return (
    <div className="m-4 flex min-h-screen md:m-8">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="border-primary/10 bg-primary/5 flex min-h-[200px] w-full flex-col items-center justify-center gap-4 rounded-lg border p-8"
      >
        <LoadingIndicator size="lg" />
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-muted-foreground"
        >
          {message}
        </motion.p>
      </motion.div>
    </div>
  );
}
