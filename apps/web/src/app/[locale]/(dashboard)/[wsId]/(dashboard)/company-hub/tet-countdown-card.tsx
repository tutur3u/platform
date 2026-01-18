'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { CountdownDigit, CountdownSeparator } from './countdown-shared';
import { calculateTetCountdown } from './utils';

export function TetCountdownCard() {
  const t = useTranslations('dashboard.tet_countdown');
  const [timeLeft, setTimeLeft] = useState(calculateTetCountdown());

  useEffect(() => {
    const timer = setInterval(() => setTimeLeft(calculateTetCountdown()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!timeLeft) {
    return (
      <div className="relative overflow-hidden rounded-2xl border-2 border-dynamic-red/30 bg-linear-to-br from-dynamic-red/10 via-dynamic-yellow/5 to-dynamic-orange/10 p-4">
        <div className="text-center">
          <div className="mb-2 flex items-center justify-center gap-2">
            <span className="text-2xl">🎊</span>
            <span className="bg-linear-to-r from-dynamic-red via-dynamic-yellow to-dynamic-orange bg-clip-text font-black text-lg text-transparent">
              {t('complete_title')}
            </span>
            <span className="text-2xl">🧧</span>
          </div>
          <p className="text-dynamic-red/70 text-sm">
            {t('complete_subtitle')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-dynamic-red/30 bg-linear-to-br from-dynamic-red/10 via-dynamic-yellow/5 to-dynamic-orange/10 p-4 backdrop-blur-sm">
      {/* Decorative elements */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-2 right-4 h-14 w-14 animate-pulse rounded-full bg-dynamic-red/10 blur-xl" />
        <div
          className="absolute bottom-2 left-4 h-12 w-12 animate-pulse rounded-full bg-dynamic-yellow/10 blur-xl"
          style={{ animationDelay: '0.5s' }}
        />
      </div>

      <div className="relative space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <span className="text-xl">🧧</span>
          <div className="flex-1">
            <h4 className="font-bold text-dynamic-red text-sm">{t('title')}</h4>
            <p className="text-[10px] text-dynamic-red/70">{t('subtitle')}</p>
          </div>
          <Badge
            variant="outline"
            className="border-dynamic-red/30 text-[9px] text-dynamic-red"
          >
            {t('event_date')}
          </Badge>
        </div>

        {/* Countdown */}
        <div className="flex justify-center gap-1 sm:gap-2">
          <CountdownDigit
            value={timeLeft.days}
            label={t('days')}
            subLabel={t('days_viet')}
            colorClass="border-dynamic-red/40 bg-dynamic-red/15 text-dynamic-red"
          />
          <CountdownSeparator colorClass="text-dynamic-red" />
          <CountdownDigit
            value={timeLeft.hours}
            label={t('hours')}
            subLabel={t('hours_viet')}
            colorClass="border-dynamic-yellow/40 bg-dynamic-yellow/15 text-dynamic-yellow"
          />
          <CountdownSeparator colorClass="text-dynamic-yellow" />
          <CountdownDigit
            value={timeLeft.minutes}
            label={t('minutes')}
            subLabel={t('minutes_viet')}
            colorClass="border-dynamic-orange/40 bg-dynamic-orange/15 text-dynamic-orange"
          />
          <CountdownSeparator colorClass="text-dynamic-orange" />
          <CountdownDigit
            value={timeLeft.seconds}
            label={t('seconds')}
            subLabel={t('seconds_viet')}
            colorClass="border-dynamic-red/40 bg-dynamic-red/15 text-dynamic-red"
          />
        </div>

        {/* Symbols Grid */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { emoji: '🌸', label: t('hoa_dao') },
            { emoji: '🎋', label: t('hoa_mai') },
            { emoji: '🧧', label: t('li_xi') },
            { emoji: '🏮', label: t('den_long') },
          ].map((item, i) => (
            <div
              key={i}
              className="flex flex-col items-center gap-1 rounded-lg bg-dynamic-red/5 p-2 transition-transform hover:scale-105"
            >
              <span className="text-lg">{item.emoji}</span>
              <span className="text-center font-medium text-[9px] text-dynamic-red/80">
                {item.label}
              </span>
            </div>
          ))}
        </div>

        {/* Motivation */}
        <div className="rounded-lg bg-linear-to-r from-dynamic-red/10 to-dynamic-yellow/10 p-2.5 text-center">
          <p className="font-bold text-[10px] text-dynamic-red">
            {t('year_of_snake')} 🐍
          </p>
        </div>
      </div>
    </div>
  );
}
