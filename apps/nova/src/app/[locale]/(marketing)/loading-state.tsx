import {
  LoadingRegion,
  SkeletonLine,
  SkeletonText,
} from '@tuturuuu/ui/skeleton';
import { motion } from 'framer-motion';

interface LoadingStateProps {
  /** Translated text announced to screen readers while the page loads. */
  srLabel: string;
}

export default function LoadingState({ srLabel }: LoadingStateProps) {
  return (
    <div className="m-4 flex min-h-screen md:m-8">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex min-h-[200px] w-full flex-col justify-center rounded-lg border border-primary/10 bg-primary/5 p-8"
      >
        <LoadingRegion className="space-y-4" srLabel={srLabel}>
          <SkeletonLine barClassName="w-1/3" size="xl" />
          <SkeletonText lines={4} />
        </LoadingRegion>
      </motion.div>
    </div>
  );
}
