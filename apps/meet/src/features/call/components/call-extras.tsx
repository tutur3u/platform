'use client';
import { LayoutGrid, Smile, Sparkles } from '@tuturuuu/icons';
import type { MeetReaction } from '@tuturuuu/realtime/meet';
import { Button } from '@tuturuuu/ui/button';
import { Label } from '@tuturuuu/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { CameraFilter, CameraLook } from '../lib/camera-effects';
import type { CallLayout } from './call-stage';
export const REACTION_GLYPHS: Record<MeetReaction, string> = {
  like: '👍',
  heart: '❤️',
  clap: '👏',
  laugh: '😄',
  wow: '😮',
  celebrate: '🎉',
};
export function CallExtras({
  layout,
  setLayout,
  look,
  setLook,
  react,
}: {
  layout: CallLayout;
  setLayout: (layout: CallLayout) => void;
  look: CameraLook;
  setLook: (look: CameraLook) => void;
  react: (reaction: MeetReaction) => void;
}) {
  const t = useTranslations('meet.call');
  const [reactionsOpen, setReactionsOpen] = useState(false);
  return (
    <>
      <Popover open={reactionsOpen} onOpenChange={setReactionsOpen}>
        <PopoverTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="size-11 rounded-full"
            aria-label={t('reactions')}
            title={t('reactions')}
          >
            <Smile className="size-5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="flex w-auto gap-1" side="top">
          {(Object.keys(REACTION_GLYPHS) as MeetReaction[]).map((reaction) => (
            <Button
              key={reaction}
              variant="ghost"
              size="icon"
              className="text-2xl"
              aria-label={t(`reaction_${reaction}`)}
              onClick={() => {
                react(reaction);
                setReactionsOpen(false);
              }}
            >
              {REACTION_GLYPHS[reaction]}
            </Button>
          ))}
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="size-11 rounded-full"
            aria-label={t('layout')}
            title={t('layout')}
          >
            <LayoutGrid className="size-5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 space-y-3" side="top">
          <p className="font-medium text-sm">{t('layout')}</p>
          <div className="grid grid-cols-2 gap-2">
            {(['auto', 'grid', 'spotlight', 'sidebar'] as CallLayout[]).map(
              (value) => (
                <Button
                  key={value}
                  variant={layout === value ? 'secondary' : 'outline'}
                  aria-pressed={layout === value}
                  onClick={() => setLayout(value)}
                >
                  {t(`layout_${value}`)}
                </Button>
              )
            )}
          </div>
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="size-11 rounded-full"
            aria-label={t('camera_effects')}
            title={t('camera_effects')}
          >
            <Sparkles className="size-5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 space-y-4" side="top">
          <div>
            <p className="font-medium text-sm">{t('camera_effects')}</p>
            <p className="mt-1 text-muted-foreground text-xs">
              {t('effects_hint')}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(['none', 'warm', 'cool', 'mono'] as CameraFilter[]).map(
              (filter) => (
                <Button
                  key={filter}
                  variant={look.filter === filter ? 'secondary' : 'outline'}
                  aria-pressed={look.filter === filter}
                  onClick={() => setLook({ ...look, filter })}
                >
                  {t(`filter_${filter}`)}
                </Button>
              )
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="meet-softness">{t('soft_portrait')}</Label>
            <input
              id="meet-softness"
              type="range"
              className="w-full accent-primary"
              min="0"
              max="100"
              step="10"
              value={Math.round(look.softness * 100)}
              onChange={(event) =>
                setLook({ ...look, softness: Number(event.target.value) / 100 })
              }
            />
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
