'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

interface PricingToggleProps {
  isYearly: boolean;
  onToggle: (isYearly: boolean) => void;
}

export function PricingToggle({ isYearly, onToggle }: PricingToggleProps) {
  const t = useTranslations('landing.pricing.toggle');
  const monthlyRef = useRef<HTMLButtonElement>(null);
  const yearlyRef = useRef<HTMLButtonElement>(null);
  const [pillStyle, setPillStyle] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const activeRef = isYearly ? yearlyRef : monthlyRef;
    if (activeRef.current) {
      setPillStyle({
        left: activeRef.current.offsetLeft,
        width: activeRef.current.offsetWidth,
      });
    }
  }, [isYearly]);

  return (
    <div className="relative inline-flex items-center rounded-full border border-foreground/10 bg-foreground/5 p-1">
      {/* Animated pill indicator */}
      <motion.div
        className="absolute top-1 bottom-1 rounded-full bg-background shadow-sm"
        initial={false}
        animate={{
          left: pillStyle.left,
          width: pillStyle.width,
        }}
        transition={{
          type: 'spring',
          stiffness: 400,
          damping: 30,
        }}
      />

      <button
        ref={monthlyRef}
        type="button"
        onClick={() => onToggle(false)}
        className={cn(
          'relative z-10 rounded-full px-4 py-1.5 font-medium text-sm transition-colors duration-200',
          !isYearly
            ? 'text-foreground'
            : 'text-foreground/60 hover:text-foreground/80'
        )}
      >
        {t('monthly')}
      </button>
      <button
        ref={yearlyRef}
        type="button"
        onClick={() => onToggle(true)}
        className={cn(
          'relative z-10 flex items-center gap-2 rounded-full px-4 py-1.5 font-medium text-sm transition-colors duration-200',
          isYearly
            ? 'text-foreground'
            : 'text-foreground/60 hover:text-foreground/80'
        )}
      >
        {t('yearly')}
        <motion.div
          animate={{
            scale: isYearly ? [1, 1.15, 1] : 1,
            rotate: isYearly ? [0, -5, 5, 0] : 0,
          }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <Badge
            variant="secondary"
            className="border-dynamic-green/30 bg-dynamic-green/10 px-1.5 py-0 text-dynamic-green text-xs"
          >
            {t('save')}
          </Badge>
        </motion.div>
      </button>
    </div>
  );
}
