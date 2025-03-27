'use client';

import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import React from 'react';

interface ThumbnailItem {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  color?: string;
  bgColor?: string;
}

interface ThumbnailGridProps {
  items: ThumbnailItem[];
  columns?: {
    sm?: number;
    md?: number;
    lg?: number;
  };
  gap?: number;
  className?: string;
}

export function ThumbnailGrid({
  items,
  columns = { sm: 2, md: 3, lg: 4 },
  gap = 4,
  className,
}: ThumbnailGridProps) {
  return (
    <div
      className={cn(
        'grid gap-4',
        `grid-cols-1 sm:grid-cols-${columns.sm} md:grid-cols-${columns.md}`,
        columns.lg && `lg:grid-cols-${columns.lg}`,
        `gap-${gap}`,
        className
      )}
    >
      {items.map((item, index) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: index * 0.05 }}
          className="flex items-start gap-3 rounded-lg border bg-card p-4 transition-all hover:bg-accent/5"
        >
          <div
            className={cn(
              'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary',
              item.bgColor,
              item.color
            )}
          >
            {item.icon}
          </div>
          <div>
            <p className="font-medium">{item.title}</p>
            <p className="text-xs text-muted-foreground">{item.description}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
