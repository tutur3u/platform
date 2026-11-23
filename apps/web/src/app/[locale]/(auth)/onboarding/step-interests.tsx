'use client';

import { useMutation } from '@tanstack/react-query';
import { Check } from '@tuturuuu/icons/lucide-static';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { InterestsScene } from './onboarding-illustrations';
import { FOCUS_RING, InlineAlert } from './welcome-controls';
import {
  INTEREST_CHIP_CLASS,
  INTEREST_IDS,
  type InterestId,
} from './welcome-model';
import { saveInterests } from './welcome-persistence';
import { StepHeading } from './welcome-shell';

/**
 * Multi-select tiles. The picks are saved as journey goals, and "Teach or
 * learn" also selects the education audience mode the mobile app reads.
 */
export function StepInterests({
  interests,
  onAdvance,
  onChange,
}: {
  interests: InterestId[];
  onAdvance: () => Promise<void>;
  onChange: (interests: InterestId[]) => void;
}) {
  const t = useTranslations('onboarding_flow');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      await saveInterests(interests);
      await onAdvance();
    },
    onError: () => setError(t('save_error')),
    onSuccess: () => setError(null),
  });

  const toggle = (id: InterestId) =>
    onChange(
      interests.includes(id)
        ? interests.filter((item) => item !== id)
        : [...interests, id]
    );

  return (
    <>
      <StepHeading
        scene={<InterestsScene className="w-[96px] sm:w-[110px]" />}
        subtitle={t('interests_subtitle')}
        title={t('interests_title')}
      />
      <div
        aria-label={t('interests_group')}
        className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2"
        role="group"
      >
        {INTEREST_IDS.map((id) => {
          const selected = interests.includes(id);
          return (
            <button
              aria-checked={selected}
              className={cn(
                FOCUS_RING,
                'flex min-h-[88px] flex-col justify-between gap-3 rounded-2xl border p-3.5 text-left transition-colors motion-reduce:transition-none',
                selected
                  ? 'border-primary bg-calendar-bg-pink'
                  : 'hover:bg-accent'
              )}
              key={id}
              onClick={() => toggle(id)}
              role="checkbox"
              type="button"
            >
              <span className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    'inline-flex h-6 items-center rounded-full px-2.5 font-bold text-xs',
                    INTEREST_CHIP_CLASS[id]
                  )}
                >
                  {t(`interest_${id}`)}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex size-5 items-center justify-center rounded-full border-2',
                    selected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-muted-foreground/75'
                  )}
                >
                  {selected ? <Check className="size-3" /> : null}
                </span>
              </span>
              <span className="font-semibold text-sm">
                {t(`interest_${id}_label`)}
              </span>
            </button>
          );
        })}
      </div>
      <InlineAlert message={error} />
      <div className="flex justify-end">
        <Button
          className="h-11 min-w-36 rounded-full"
          disabled={save.isPending}
          onClick={() => save.mutate()}
          type="button"
        >
          {save.isPending ? t('saving') : t('finish')}
        </Button>
      </div>
    </>
  );
}
