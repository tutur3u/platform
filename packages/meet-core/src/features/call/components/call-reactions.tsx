'use client';
import {
  HandHeart,
  Heart,
  Laugh,
  PartyPopper,
  Smile,
  Sparkles,
  ThumbsUp,
} from '@tuturuuu/icons';
import type { MeetReaction } from '@tuturuuu/realtime/meet';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type ComponentType, useState } from 'react';
import { controlButtonClass } from './control-bar';

/** One icon and token tone per reaction, shared by the picker and the overlay. */
export const REACTION_ICONS: Record<
  MeetReaction,
  { icon: ComponentType<{ className?: string }>; tone: string }
> = {
  like: { icon: ThumbsUp, tone: 'text-dynamic-blue' },
  heart: { icon: Heart, tone: 'text-dynamic-red' },
  clap: { icon: HandHeart, tone: 'text-dynamic-pink' },
  laugh: { icon: Laugh, tone: 'text-dynamic-yellow' },
  wow: { icon: Sparkles, tone: 'text-dynamic-purple' },
  celebrate: { icon: PartyPopper, tone: 'text-dynamic-orange' },
};
export const REACTIONS = Object.keys(REACTION_ICONS) as MeetReaction[];

export function ReactionIcon({
  reaction,
  className,
}: {
  reaction: MeetReaction;
  className?: string;
}) {
  const { icon: Icon, tone } = REACTION_ICONS[reaction];
  return <Icon className={cn(tone, className)} />;
}

/** The six reactions as one row of icon buttons. */
export function ReactionPicker({
  react,
  onPicked,
}: {
  react: (reaction: MeetReaction) => void;
  onPicked?: () => void;
}) {
  const t = useTranslations('meet.call');
  return (
    <fieldset className="flex items-center gap-1 border-0 p-0">
      <legend className="sr-only">{t('reactions')}</legend>
      {REACTIONS.map((reaction) => (
        <Button
          key={reaction}
          type="button"
          size="icon"
          variant="ghost"
          className="size-11 rounded-full"
          aria-label={t(`reaction_${reaction}`)}
          title={t(`reaction_${reaction}`)}
          onClick={() => {
            react(reaction);
            onPicked?.();
          }}
        >
          <ReactionIcon reaction={reaction} className="size-5" />
        </Button>
      ))}
    </fieldset>
  );
}

/** Root-bar reactions entry: one round control that opens the picker above it. */
export function CallReactionsMenu({
  react,
}: {
  react: (reaction: MeetReaction) => void;
}) {
  const t = useTranslations('meet.call');
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              aria-label={t('reactions')}
              className={controlButtonClass}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Smile className="size-5" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{t('reactions')}</TooltipContent>
      </Tooltip>
      <PopoverContent
        aria-label={t('reactions')}
        className="w-auto rounded-full p-1"
        side="top"
        sideOffset={8}
      >
        <ReactionPicker react={react} />
      </PopoverContent>
    </Popover>
  );
}
