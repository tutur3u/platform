'use client';

import { Cookie, Hand, MessageCircle, Timer, Trophy } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';

interface QuickActionsProps {
  onFeed: () => void;
  onChat: () => void;
  onStartFocus: () => void;
  onPet?: () => void;
  onViewAchievements: () => void;
  isFeedingDisabled?: boolean;
  isFocusActive?: boolean;
  className?: string;
}

export function QuickActions({
  onFeed,
  onChat,
  onStartFocus,
  onPet,
  onViewAchievements,
  isFeedingDisabled = false,
  isFocusActive = false,
  className,
}: QuickActionsProps) {
  return (
    <TooltipProvider>
      <div className={cn('flex items-center gap-2', className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={onFeed}
              disabled={isFeedingDisabled}
              className="hover:border-dynamic-orange/50 hover:bg-dynamic-orange/10"
            >
              <Cookie className="h-5 w-5 text-dynamic-orange" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{isFeedingDisabled ? 'Tuna is full!' : 'Feed Tuna'}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={onChat}
              className="hover:border-dynamic-blue/50 hover:bg-dynamic-blue/10"
            >
              <MessageCircle className="h-5 w-5 text-dynamic-blue" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Chat with Tuna</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isFocusActive ? 'default' : 'outline'}
              size="icon"
              onClick={onStartFocus}
              className={cn(
                !isFocusActive &&
                  'hover:border-dynamic-purple/50 hover:bg-dynamic-purple/10'
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
              {isFocusActive ? 'Focus session active' : 'Start focus session'}
            </p>
          </TooltipContent>
        </Tooltip>

        {onPet && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={onPet}
                className="hover:border-dynamic-pink/50 hover:bg-dynamic-pink/10"
              >
                <Hand className="h-5 w-5 text-dynamic-pink" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Pet Tuna</p>
            </TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={onViewAchievements}
              className="hover:border-dynamic-yellow/50 hover:bg-dynamic-yellow/10"
            >
              <Trophy className="h-5 w-5 text-dynamic-yellow" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>View achievements</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
