'use client';
import { LayoutGrid, Smile, Sparkles } from '@tuturuuu/icons';
import type { MeetReaction } from '@tuturuuu/realtime/meet';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Button } from '@tuturuuu/ui/button';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
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
  setLook: (look: CameraLook) => Promise<void>;
  react: (reaction: MeetReaction) => void;
}) {
  const t = useTranslations('meet.call');
  const updateLook = (next: CameraLook) => {
    void setLook(next).catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        toast.error(t('effects_failed'));
      }
    });
  };
  return (
    <Accordion type="single" collapsible className="border-t px-3">
      <AccordionItem value="reactions">
        <AccordionTrigger className="justify-start gap-3 py-2">
          <span aria-hidden="true">
            <Smile className="size-5" />
          </span>
          <span className="flex-1 text-left">{t('reactions')}</span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="grid grid-cols-3 gap-1">
            {(Object.keys(REACTION_GLYPHS) as MeetReaction[]).map(
              (reaction) => (
                <Button
                  key={reaction}
                  variant="ghost"
                  className="min-h-11 text-xl"
                  aria-label={t(`reaction_${reaction}`)}
                  onClick={() => react(reaction)}
                >
                  {REACTION_GLYPHS[reaction]}
                </Button>
              )
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="layout">
        <AccordionTrigger className="justify-start gap-3 py-2">
          <span aria-hidden="true">
            <LayoutGrid className="size-5" />
          </span>
          <span className="flex-1 text-left">{t('layout')}</span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="grid grid-cols-2 gap-2">
            {(['auto', 'grid', 'spotlight', 'sidebar'] as const).map(
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
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="effects">
        <AccordionTrigger className="justify-start gap-3 py-2">
          <span aria-hidden="true">
            <Sparkles className="size-5" />
          </span>
          <span className="flex-1 text-left">{t('camera_effects')}</span>
        </AccordionTrigger>
        <AccordionContent className="space-y-3">
          <p className="text-muted-foreground text-xs">{t('effects_hint')}</p>
          <div className="grid grid-cols-2 gap-2">
            {(['none', 'warm', 'cool', 'mono'] satisfies CameraFilter[]).map(
              (filter) => (
                <Button
                  key={filter}
                  variant={look.filter === filter ? 'secondary' : 'outline'}
                  aria-pressed={look.filter === filter}
                  onClick={() => updateLook({ ...look, filter })}
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
                updateLook({
                  ...look,
                  softness: Number(event.target.value) / 100,
                })
              }
            />
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
