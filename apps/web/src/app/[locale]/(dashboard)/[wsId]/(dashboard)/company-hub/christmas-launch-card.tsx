'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { CountdownDigit, CountdownSeparator } from './countdown-shared';
import { calculateChristmasLaunchCountdown } from './utils';

export function ChristmasLaunchCard() {
  const t = useTranslations('dashboard.year_schedule');
  const [timeLeft, setTimeLeft] = useState(calculateChristmasLaunchCountdown);

  useEffect(() => {
    const timer = setInterval(
      () => setTimeLeft(calculateChristmasLaunchCountdown()),
      1000
    );
    return () => clearInterval(timer);
  }, []);

  if (!timeLeft) {
    return (
      <div className="relative overflow-hidden rounded-2xl border-2 border-dynamic-green/30 bg-linear-to-br from-dynamic-green/10 via-dynamic-red/5 to-dynamic-yellow/10 p-4">
        <div className="text-center">
          <div className="mb-2 flex items-center justify-center gap-2">
            <span className="text-2xl">🎄</span>
            <span className="bg-linear-to-r from-dynamic-green via-dynamic-red to-dynamic-yellow bg-clip-text font-black text-lg text-transparent">
              {t('christmas_launch.complete_title')}
            </span>
            <span className="text-2xl">🎁</span>
          </div>
          <p className="text-dynamic-green/70 text-sm">
            {t('christmas_launch.complete_message')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-dynamic-green/30 bg-linear-to-br from-dynamic-green/10 via-dynamic-red/5 to-dynamic-yellow/10 p-4 backdrop-blur-sm">
      <div className="relative space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🎄</span>
          <div className="flex-1">
            <h4 className="font-bold text-dynamic-green text-sm">
              {t('christmas_launch.title')}
            </h4>
            <p className="text-[10px] text-dynamic-green/70">
              {t('christmas_launch.subtitle')}
            </p>
          </div>
          <Badge
            variant="outline"
            className="border-dynamic-green/30 text-[9px] text-dynamic-green"
          >
            {t('christmas_launch.date')}
          </Badge>
        </div>
        <div className="flex justify-center gap-1 sm:gap-2">
          <CountdownDigit
            value={timeLeft.days}
            label={t('days')}
            subLabel="ngày"
            colorClass="border-dynamic-green/40 bg-dynamic-green/15 text-dynamic-green"
          />
          <CountdownSeparator colorClass="text-dynamic-green" />
          <CountdownDigit
            value={timeLeft.hours}
            label={t('hours')}
            subLabel="giờ"
            colorClass="border-dynamic-red/40 bg-dynamic-red/15 text-dynamic-red"
          />
          <CountdownSeparator colorClass="text-dynamic-red" />
          <CountdownDigit
            value={timeLeft.minutes}
            label={t('minutes')}
            subLabel="phút"
            colorClass="border-dynamic-yellow/40 bg-dynamic-yellow/15 text-dynamic-yellow"
          />
          <CountdownSeparator colorClass="text-dynamic-yellow" />
          <CountdownDigit
            value={timeLeft.seconds}
            label={t('seconds')}
            subLabel="giây"
            colorClass="border-dynamic-green/40 bg-dynamic-green/15 text-dynamic-green"
          />
        </div>
        <div className="rounded-lg bg-linear-to-r from-dynamic-green/10 to-dynamic-red/10 p-2.5 text-center">
          <p className="font-bold text-[10px] text-dynamic-green">
            {t('christmas_launch.countdown_message')} 🎄
          </p>
        </div>
      </div>
    </div>
  );
}
