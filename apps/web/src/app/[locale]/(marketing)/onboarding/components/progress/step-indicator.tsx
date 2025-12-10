'use client';

import { Check } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';

interface StepIndicatorProps {
  stepNumber: number;
  label: string;
  status: 'completed' | 'active' | 'pending';
  isLast?: boolean;
}

export function StepIndicator({
  stepNumber,
  label,
  status,
  isLast = false,
}: StepIndicatorProps) {
  return (
    <div className="flex items-center">
      <div className="flex flex-col items-center gap-1.5">
        {/* Step circle */}
        <motion.div
          initial={false}
          animate={{
            scale: status === 'active' ? 1 : 1,
          }}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors',
            status === 'completed' && 'border-primary bg-primary',
            status === 'active' && 'border-primary bg-primary',
            status === 'pending' && 'border-muted-foreground/30 bg-transparent'
          )}
        >
          {status === 'completed' ? (
            <Check className="h-4 w-4 text-primary-foreground" />
          ) : (
            <span
              className={cn(
                'font-medium text-xs',
                status === 'active'
                  ? 'text-primary-foreground'
                  : 'text-muted-foreground/50'
              )}
            >
              {stepNumber}
            </span>
          )}
        </motion.div>

        {/* Label */}
        <span
          className={cn(
            'hidden text-xs md:block',
            status === 'active'
              ? 'font-medium text-foreground'
              : 'text-muted-foreground'
          )}
        >
          {label}
        </span>
      </div>

      {/* Connector line */}
      {!isLast && (
        <div
          className={cn(
            'mx-2 h-0.5 w-6 rounded-full transition-colors md:mx-3 md:w-10',
            status === 'completed' ? 'bg-primary' : 'bg-muted-foreground/20'
          )}
        />
      )}
    </div>
  );
}
