'use client';

import {
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Cookie,
  Hand,
  History,
  ListTodo,
  MessageCircle,
  Phone,
  Timer,
  Trophy,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';

export type TunaMode =
  | 'home'
  | 'focus'
  | 'achievements'
  | 'history'
  | 'tasks'
  | 'calendar';

interface ActionBarProps {
  activeMode: TunaMode;
  onModeChange: (mode: TunaMode) => void;
  onFeed: () => void;
  onChat: () => void;
  onPet: () => void;
  onStartFocus: () => void;
  onTalk: () => void;
  isFeedingDisabled?: boolean;
  isFocusActive?: boolean;
  isTalkActive?: boolean;
  className?: string;
}

export function ActionBar({
  activeMode,
  onModeChange,
  onFeed,
  onChat,
  onPet,
  onStartFocus,
  onTalk,
  isFeedingDisabled = false,
  isFocusActive = false,
  isTalkActive = false,
  className,
}: ActionBarProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  // In focus mode, show minimal controls
  if (activeMode === 'focus' && isFocusActive) {
    return null; // Focus mode has its own overlay
  }

  return (
    <AnimatePresence>
      <motion.div
        className={cn(
          'fixed right-0 bottom-0 left-0 z-30',
          'mx-2 mb-2 md:mx-4 md:mb-4',
          'flex justify-center',
          className
        )}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.3 }}
      >
        <div
          className={cn(
            'rounded-2xl border border-border/30',
            'bg-background/70 backdrop-blur-lg',
            'shadow-xl',
            'overflow-hidden'
          )}
        >
          {/* Expandable section with quick actions */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                className="flex items-center gap-2 px-4 pt-3"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <TooltipProvider>
                  {/* Feed */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={onFeed}
                        disabled={isFeedingDisabled}
                        className="hover:bg-dynamic-orange/10"
                      >
                        <Cookie className="h-5 w-5 text-dynamic-orange" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{isFeedingDisabled ? 'Tuna is full!' : 'Feed Tuna'}</p>
                    </TooltipContent>
                  </Tooltip>

                  {/* Chat */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={onChat}
                        className="hover:bg-dynamic-blue/10"
                      >
                        <MessageCircle className="h-5 w-5 text-dynamic-blue" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Chat with Tuna</p>
                    </TooltipContent>
                  </Tooltip>

                  {/* Focus */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={isFocusActive ? 'default' : 'ghost'}
                        size="icon"
                        onClick={onStartFocus}
                        className={cn(
                          !isFocusActive && 'hover:bg-dynamic-purple/10'
                        )}
                      >
                        <Timer
                          className={cn(
                            'h-5 w-5',
                            isFocusActive ? 'text-white' : 'text-dynamic-purple'
                          )}
                        />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        {isFocusActive
                          ? 'Focus session active'
                          : 'Start focus session'}
                      </p>
                    </TooltipContent>
                  </Tooltip>

                  {/* Pet */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={onPet}
                        className="hover:bg-dynamic-pink/10"
                      >
                        <Hand className="h-5 w-5 text-dynamic-pink" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Pet Tuna</p>
                    </TooltipContent>
                  </Tooltip>

                  {/* Achievements */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={
                          activeMode === 'achievements' ? 'default' : 'ghost'
                        }
                        size="icon"
                        onClick={() =>
                          onModeChange(
                            activeMode === 'achievements'
                              ? 'home'
                              : 'achievements'
                          )
                        }
                        className={cn(
                          activeMode !== 'achievements' &&
                            'hover:bg-dynamic-yellow/10'
                        )}
                      >
                        <Trophy
                          className={cn(
                            'h-5 w-5',
                            activeMode === 'achievements'
                              ? 'text-white'
                              : 'text-dynamic-yellow'
                          )}
                        />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Achievements</p>
                    </TooltipContent>
                  </Tooltip>

                  {/* Tasks */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={activeMode === 'tasks' ? 'default' : 'ghost'}
                        size="icon"
                        onClick={() =>
                          onModeChange(
                            activeMode === 'tasks' ? 'home' : 'tasks'
                          )
                        }
                        className={cn(
                          activeMode !== 'tasks' && 'hover:bg-dynamic-green/10'
                        )}
                      >
                        <ListTodo
                          className={cn(
                            'h-5 w-5',
                            activeMode === 'tasks'
                              ? 'text-white'
                              : 'text-dynamic-green'
                          )}
                        />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Tasks</p>
                    </TooltipContent>
                  </Tooltip>

                  {/* Calendar */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={
                          activeMode === 'calendar' ? 'default' : 'ghost'
                        }
                        size="icon"
                        onClick={() =>
                          onModeChange(
                            activeMode === 'calendar' ? 'home' : 'calendar'
                          )
                        }
                        className={cn(
                          activeMode !== 'calendar' &&
                            'hover:bg-dynamic-cyan/10'
                        )}
                      >
                        <CalendarClock
                          className={cn(
                            'h-5 w-5',
                            activeMode === 'calendar'
                              ? 'text-white'
                              : 'text-dynamic-cyan'
                          )}
                        />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Calendar</p>
                    </TooltipContent>
                  </Tooltip>

                  {/* History */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={activeMode === 'history' ? 'default' : 'ghost'}
                        size="icon"
                        onClick={() =>
                          onModeChange(
                            activeMode === 'history' ? 'home' : 'history'
                          )
                        }
                        className={cn(
                          activeMode !== 'history' && 'hover:bg-muted'
                        )}
                      >
                        <History
                          className={cn(
                            'h-5 w-5',
                            activeMode === 'history'
                              ? 'text-white'
                              : 'text-muted-foreground'
                          )}
                        />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>History</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {/* Divider */}
                <div className="mx-1 h-6 w-px bg-border" />

                {/* Talk button */}
                <Button
                  variant={isTalkActive ? 'destructive' : 'default'}
                  size="sm"
                  onClick={onTalk}
                  className="gap-2"
                >
                  <Phone className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    {isTalkActive ? 'End' : 'Talk'}
                  </span>
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Toggle expand/collapse on mobile */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex w-full items-center justify-center py-1.5 transition-colors hover:bg-muted/50 md:hidden"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {/* Bottom padding for desktop */}
          <div className="hidden h-3 md:block" />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
