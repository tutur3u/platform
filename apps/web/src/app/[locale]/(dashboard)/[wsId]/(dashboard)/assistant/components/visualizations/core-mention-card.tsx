'use client';

import { AlertCircle, CheckCircle, Info, Sparkles, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import type { CoreMentionVisualization } from '../../types/visualizations';

interface CoreMentionCardProps {
  data: CoreMentionVisualization['data'];
  onDismiss?: () => void;
}

const emphasisConfig = {
  info: {
    icon: Info,
    bgColor: 'bg-dynamic-blue/10',
    borderColor: 'border-dynamic-blue/30',
    iconColor: 'text-dynamic-blue',
    headerBg: 'bg-dynamic-blue/5',
  },
  warning: {
    icon: AlertCircle,
    bgColor: 'bg-dynamic-orange/10',
    borderColor: 'border-dynamic-orange/30',
    iconColor: 'text-dynamic-orange',
    headerBg: 'bg-dynamic-orange/5',
  },
  success: {
    icon: CheckCircle,
    bgColor: 'bg-dynamic-green/10',
    borderColor: 'border-dynamic-green/30',
    iconColor: 'text-dynamic-green',
    headerBg: 'bg-dynamic-green/5',
  },
  highlight: {
    icon: Sparkles,
    bgColor: 'bg-dynamic-purple/10',
    borderColor: 'border-dynamic-purple/30',
    iconColor: 'text-dynamic-purple',
    headerBg: 'bg-linear-to-r from-dynamic-purple/10 to-dynamic-pink/10',
  },
};

export function CoreMentionCard({ data, onDismiss }: CoreMentionCardProps) {
  const { title, content, emphasis = 'highlight' } = data;
  const style = emphasisConfig[emphasis];
  const Icon = style.icon;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: -20 }}
      transition={{
        type: 'spring',
        stiffness: 400,
        damping: 30,
      }}
    >
      <Card
        className={cn(
          'relative w-full max-w-lg overflow-hidden border-2 shadow-2xl backdrop-blur-md',
          style.borderColor,
          style.bgColor
        )}
      >
        {/* Close Button */}
        {onDismiss && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-3 right-3 z-20 h-8 w-8 rounded-full border border-border/30 bg-background/80 shadow-md backdrop-blur-sm transition-all duration-200 hover:border-destructive/50 hover:bg-destructive hover:text-destructive-foreground"
            onClick={onDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
        )}

        {/* Header */}
        <div className={cn('px-5 py-4', style.headerBg)}>
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full',
                style.bgColor
              )}
            >
              <Icon className={cn('h-5 w-5', style.iconColor)} />
            </div>
            <h3 className="pr-10 font-bold text-lg leading-tight">{title}</h3>
          </div>
        </div>

        {/* Content */}
        <div className="px-5 py-4">
          <p className="whitespace-pre-wrap text-base leading-relaxed">
            {content}
          </p>
        </div>
      </Card>
    </motion.div>
  );
}
