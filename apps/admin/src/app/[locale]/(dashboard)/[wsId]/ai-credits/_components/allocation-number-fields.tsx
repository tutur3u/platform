'use client';

import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import type { useTranslations } from 'next-intl';
import type { Dispatch, SetStateAction } from 'react';

export function AllocationNumberFields({
  creditsPerSeat,
  dailyLimit,
  maxOutputTokens,
  monthlyCredits,
  setCreditsPerSeat,
  setDailyLimit,
  setMaxOutputTokens,
  setMonthlyCredits,
  t,
}: {
  creditsPerSeat: number | null;
  dailyLimit: number | null;
  maxOutputTokens: number | null;
  monthlyCredits: number;
  setCreditsPerSeat: Dispatch<SetStateAction<number | null>>;
  setDailyLimit: Dispatch<SetStateAction<number | null>>;
  setMaxOutputTokens: Dispatch<SetStateAction<number | null>>;
  setMonthlyCredits: Dispatch<SetStateAction<number>>;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label>{t('monthly_credits')}</Label>
        <Input
          type="number"
          value={monthlyCredits}
          onChange={(event) => setMonthlyCredits(Number(event.target.value))}
        />
      </div>
      <div className="space-y-2">
        <Label>{t('credits_per_seat')}</Label>
        <Input
          type="number"
          value={creditsPerSeat ?? ''}
          placeholder="-"
          onChange={(event) =>
            setCreditsPerSeat(
              event.target.value ? Number(event.target.value) : null
            )
          }
        />
      </div>
      <div className="space-y-2">
        <Label>{t('daily_limit')}</Label>
        <Input
          type="number"
          value={dailyLimit ?? ''}
          placeholder={String(t('unlimited'))}
          onChange={(event) =>
            setDailyLimit(
              event.target.value ? Number(event.target.value) : null
            )
          }
        />
      </div>
      <div className="space-y-2">
        <Label>{t('max_output_tokens')}</Label>
        <Input
          type="number"
          value={maxOutputTokens ?? ''}
          placeholder={String(t('unlimited'))}
          onChange={(event) =>
            setMaxOutputTokens(
              event.target.value ? Number(event.target.value) : null
            )
          }
        />
      </div>
    </div>
  );
}
