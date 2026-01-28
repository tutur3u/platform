'use client';

import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Cookie,
  Heart,
  MessageCircle,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import type { TunaPet } from '../../types/tuna';
import { MoodIndicator } from '../stats/mood-indicator';

interface SidePanelProps {
  pet: TunaPet;
  isFocusMode?: boolean;
  className?: string;
}

export function SidePanel({
  pet,
  isFocusMode = false,
  className,
}: SidePanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Hide in focus mode
  if (isFocusMode) {
    return null;
  }

  const getHealthColor = (value: number) => {
    if (value >= 70) return 'text-dynamic-green';
    if (value >= 40) return 'text-dynamic-yellow';
    return 'text-dynamic-red';
  };

  const getHungerColor = (value: number) => {
    if (value >= 70) return 'text-dynamic-orange';
    if (value >= 40) return 'text-dynamic-yellow';
    return 'text-dynamic-red';
  };

  const getProgressClass = (value: number, type: 'health' | 'hunger') => {
    if (type === 'health') {
      if (value >= 70) return '[&>div]:bg-dynamic-green';
      if (value >= 40) return '[&>div]:bg-dynamic-yellow';
      return '[&>div]:bg-dynamic-red';
    }
    if (value >= 70) return '[&>div]:bg-dynamic-orange';
    if (value >= 40) return '[&>div]:bg-dynamic-yellow';
    return '[&>div]:bg-dynamic-red';
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        className={cn(
          'fixed top-1/2 right-0 z-30 -translate-y-1/2',
          'mr-2 md:mr-4',
          className
        )}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ duration: 0.3 }}
      >
        {/* Toggle button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={cn(
            'absolute top-1/2 -left-10 z-10 -translate-y-1/2 border border-border/30 bg-background/70 backdrop-blur-lg',
            'h-8 w-8 rounded-r-none rounded-l-lg'
          )}
        >
          {isCollapsed ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>

        <AnimatePresence mode="wait">
          {!isCollapsed ? (
            <motion.div
              key="expanded"
              className={cn(
                'w-56 md:w-64',
                'rounded-2xl border border-border/30',
                'bg-background/70 backdrop-blur-xl',
                'p-4 shadow-xl'
              )}
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 'auto', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {/* Pet name and mood */}
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold">{pet.name}</h3>
                <MoodIndicator mood={pet.mood} size="sm" showLabel={false} />
              </div>

              {/* Health meter */}
              <div className="mb-3">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1">
                    <Heart
                      className={cn('h-3.5 w-3.5', getHealthColor(pet.health))}
                    />
                    <span>Health</span>
                  </div>
                  <span className={getHealthColor(pet.health)}>
                    {pet.health}%
                  </span>
                </div>
                <Progress
                  value={pet.health}
                  className={cn('h-2', getProgressClass(pet.health, 'health'))}
                />
              </div>

              {/* Hunger meter */}
              <div className="mb-4">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1">
                    <Cookie
                      className={cn('h-3.5 w-3.5', getHungerColor(pet.hunger))}
                    />
                    <span>Hunger</span>
                  </div>
                  <span className={getHungerColor(pet.hunger)}>
                    {pet.hunger}%
                  </span>
                </div>
                <Progress
                  value={pet.hunger}
                  className={cn('h-2', getProgressClass(pet.hunger, 'hunger'))}
                />
                {pet.hunger < 30 && (
                  <p className="mt-1 text-dynamic-red text-xs">
                    Tuna is hungry!
                  </p>
                )}
              </div>

              {/* Divider */}
              <div className="mb-4 h-px bg-border" />

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="rounded-lg bg-muted/30 p-2">
                  <div className="flex items-center justify-center gap-1">
                    <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-bold text-lg">
                      {pet.total_conversations}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs">Chats</p>
                </div>
                <div className="rounded-lg bg-muted/30 p-2">
                  <div className="flex items-center justify-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-bold text-lg">
                      {Math.floor(pet.total_focus_minutes / 60)}h
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs">Focus</p>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="collapsed"
              className={cn(
                'w-12',
                'rounded-2xl border border-border/30',
                'bg-background/70 backdrop-blur-xl',
                'flex flex-col items-center gap-3 py-4 shadow-xl'
              )}
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 48, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {/* Collapsed view - just icons */}
              <div className="flex flex-col items-center gap-1">
                <Heart className={cn('h-4 w-4', getHealthColor(pet.health))} />
                <span className="font-medium text-xs">{pet.health}</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Cookie className={cn('h-4 w-4', getHungerColor(pet.hunger))} />
                <span className="font-medium text-xs">{pet.hunger}</span>
              </div>
              <MoodIndicator mood={pet.mood} size="sm" showLabel={false} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
