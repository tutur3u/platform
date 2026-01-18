'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { CountdownDigit, CountdownSeparator } from './countdown-shared';
import { calculateBirthdayCountdown } from './utils';

export function BirthdayCountdownCard() {
  const t = useTranslations('dashboard.year_schedule');
  const [birthdayData, setBirthdayData] = useState(calculateBirthdayCountdown);

  useEffect(() => {
    const timer = setInterval(
      () => setBirthdayData(calculateBirthdayCountdown()),
      1000
    );
    return () => clearInterval(timer);
  }, []);

  const { countdown, nextAge, isBirthday } = birthdayData;

  if (isBirthday) {
    return (
      <div className="relative overflow-hidden rounded-2xl border-2 border-dynamic-orange/30 bg-linear-to-br from-dynamic-orange/10 via-dynamic-yellow/5 to-dynamic-pink/10 p-4">
        <div className="text-center">
          <div className="mb-2 flex items-center justify-center gap-2">
            <span className="text-2xl">🎂</span>
            <span className="bg-linear-to-r from-dynamic-orange via-dynamic-yellow to-dynamic-pink bg-clip-text font-black text-lg text-transparent">
              {t('birthday.happy_birthday', { count: nextAge })}
            </span>
            <span className="text-2xl">🎉</span>
          </div>
          <p className="text-dynamic-orange/70 text-sm">
            {t('birthday.celebration_message')}
          </p>
        </div>
      </div>
    );
  }

  if (!countdown) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-dynamic-orange/30 bg-linear-to-br from-dynamic-orange/10 via-dynamic-yellow/5 to-dynamic-pink/10 p-4 backdrop-blur-sm">
      <div className="relative space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🎂</span>
          <div className="flex-1">
            <h4 className="font-bold text-dynamic-orange text-sm">
              {t('birthday.countdown_title')}
            </h4>
            <p className="text-[10px] text-dynamic-orange/70">
              {t('birthday.turning', { age: nextAge })}
            </p>
          </div>
          <Badge
            variant="outline"
            className="border-dynamic-orange/30 text-[9px] text-dynamic-orange"
          >
            {t('birthday.date')}
          </Badge>
        </div>
        <div className="flex justify-center gap-1 sm:gap-2">
          <CountdownDigit
            value={countdown.days}
            label={t('days')}
            subLabel="ngày"
            colorClass="border-dynamic-orange/40 bg-dynamic-orange/15 text-dynamic-orange"
          />
          <CountdownSeparator colorClass="text-dynamic-orange" />
          <CountdownDigit
            value={countdown.hours}
            label={t('hours')}
            subLabel="giờ"
            colorClass="border-dynamic-yellow/40 bg-dynamic-yellow/15 text-dynamic-yellow"
          />
          <CountdownSeparator colorClass="text-dynamic-yellow" />
          <CountdownDigit
            value={countdown.minutes}
            label={t('minutes')}
            subLabel="phút"
            colorClass="border-dynamic-pink/40 bg-dynamic-pink/15 text-dynamic-pink"
          />
          <CountdownSeparator colorClass="text-dynamic-pink" />
          <CountdownDigit
            value={countdown.seconds}
            label={t('seconds')}
            subLabel="giây"
            colorClass="border-dynamic-orange/40 bg-dynamic-orange/15 text-dynamic-orange"
          />
        </div>
        <div className="rounded-lg bg-linear-to-r from-dynamic-orange/10 to-dynamic-pink/10 p-2.5 text-center">
          <p className="font-bold text-[10px] text-dynamic-orange">
            {t('birthday.countdown_message')} 🎂
          </p>
        </div>
      </div>
    </div>
  );
}
