import { motion } from 'framer-motion';

interface LoadingIndicatorProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function LoadingIndicator({
  size = 'md',
  className = '',
}: LoadingIndicatorProps) {
  const sizeClass = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  }[size];

  return (
    <div className={`relative ${sizeClass} ${className}`}>
      <motion.div
        className="border-primary/20 absolute inset-0 rounded-full border-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      />
      <motion.div
        className="border-primary absolute inset-0 rounded-full border-2 border-r-transparent"
        animate={{ rotate: 360 }}
        transition={{
          duration: 1,
          repeat: Infinity,
          ease: 'linear',
        }}
      />
    </div>
  );
}
