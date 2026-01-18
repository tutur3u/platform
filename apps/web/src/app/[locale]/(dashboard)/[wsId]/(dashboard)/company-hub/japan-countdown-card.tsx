'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { CountdownDigit, CountdownSeparator } from './countdown-shared';
import { calculateJapanCountdown } from './utils';

export function JapanCountdownCard() {
  const t = useTranslations('dashboard.japan_trip_countdown');
  const [timeLeft, setTimeLeft] = useState(calculateJapanCountdown());

  useEffect(() => {
    const timer = setInterval(
      () => setTimeLeft(calculateJapanCountdown()),
      1000
    );
    return () => clearInterval(timer);
  }, []);

  if (!timeLeft) {
    return (
      <div className="relative overflow-hidden rounded-2xl border-2 border-dynamic-pink/30 bg-linear-to-br from-dynamic-pink/10 via-dynamic-rose/5 to-dynamic-purple/10 p-4">
        <div className="text-center">
          <div className="mb-2 flex items-center justify-center gap-2">
            <span className="text-2xl">🇯🇵</span>
            <span className="bg-linear-to-r from-dynamic-pink via-dynamic-rose to-dynamic-purple bg-clip-text font-black text-lg text-transparent">
              {t('complete_title')}
            </span>
            <span className="text-2xl">✨</span>
          </div>
          <p className="text-dynamic-pink/70 text-sm">
            {t('complete_subtitle')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-dynamic-pink/30 bg-linear-to-br from-dynamic-pink/10 via-dynamic-rose/5 to-dynamic-purple/10 p-4 backdrop-blur-sm">
      {/* Decorative elements */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-2 left-4 h-14 w-14 animate-pulse rounded-full bg-dynamic-pink/10 blur-xl" />
        <div
          className="absolute right-4 bottom-2 h-12 w-12 animate-pulse rounded-full bg-dynamic-purple/10 blur-xl"
          style={{ animationDelay: '0.7s' }}
        />
      </div>

      <div className="relative space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <span className="text-xl">🗼</span>
          <div className="flex-1">
            <h4 className="font-bold text-dynamic-pink text-sm">
              {t('title')}
            </h4>
            <p className="text-[10px] text-dynamic-pink/70">
              {t('subtitle_jp')}
            </p>
          </div>
          <Badge
            variant="outline"
            className="border-dynamic-pink/30 text-[9px] text-dynamic-pink"
          >
            {t('event_date')}
          </Badge>
        </div>

        {/* Countdown */}
        <div className="flex justify-center gap-1 sm:gap-2">
          <CountdownDigit
            value={timeLeft.days}
            label={t('days')}
            subLabel={t('days_jp')}
            colorClass="border-dynamic-pink/40 bg-dynamic-pink/15 text-dynamic-pink"
          />
          <CountdownSeparator colorClass="text-dynamic-pink" />
          <CountdownDigit
            value={timeLeft.hours}
            label={t('hours')}
            subLabel={t('hours_jp')}
            colorClass="border-dynamic-rose/40 bg-dynamic-rose/15 text-dynamic-rose"
          />
          <CountdownSeparator colorClass="text-dynamic-rose" />
          <CountdownDigit
            value={timeLeft.minutes}
            label={t('minutes')}
            subLabel={t('minutes_jp')}
            colorClass="border-dynamic-purple/40 bg-dynamic-purple/15 text-dynamic-purple"
          />
          <CountdownSeparator colorClass="text-dynamic-purple" />
          <CountdownDigit
            value={timeLeft.seconds}
            label={t('seconds')}
            subLabel={t('seconds_jp')}
            colorClass="border-dynamic-pink/40 bg-dynamic-pink/15 text-dynamic-pink"
          />
        </div>

        {/* Journey Progress */}
        <div className="space-y-1.5">
          {[
            {
              emoji: '💰',
              title: t('team_earned'),
              desc: t('team_earned_desc'),
            },
            {
              emoji: '🚀',
              title: t('profitability_achieved'),
              desc: t('profitability_achieved_desc'),
            },
            {
              emoji: '✈️',
              title: t('japan_trip_realized'),
              desc: t('japan_trip_realized_desc'),
            },
          ].map((item, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-lg bg-dynamic-pink/5 p-2 transition-colors hover:bg-dynamic-pink/10"
            >
              <span className="text-base">{item.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-[10px] text-dynamic-pink">
                  {item.title}
                </p>
                <p className="text-[9px] text-muted-foreground">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Motivation */}
        <div className="rounded-lg bg-linear-to-r from-dynamic-pink/10 to-dynamic-rose/10 p-2 text-center">
          <p className="font-bold text-[9px] text-dynamic-pink">
            {t('motivation')} 🌸
          </p>
        </div>
      </div>
    </div>
  );
}
