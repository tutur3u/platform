'use client';

import { Clock } from '@tuturuuu/icons';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

const CountdownTet2026 = () => {
  const t = useTranslations('dashboard.tet_countdown');

  const calculateTimeLeft = () => {
    // February 17, 2026 at 00:00:00 Vietnam time (GMT+7) - Lunar New Year's Eve midnight
    const milestoneDate = new Date('2026-02-16T17:00:00Z'); // 00:00 AM GMT+7 on Feb 17 = 5:00 PM UTC on Feb 16
    const difference = milestoneDate.getTime() - Date.now();

    if (difference > 0) {
      return {
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        seconds: Math.floor((difference / 1000) % 60),
      };
    }

    return null;
  };

  const calculateProgress = () => {
    // February 17, 2026 at 00:00:00 Vietnam time (GMT+7)
    const milestoneDate = new Date('2026-02-16T17:00:00Z');
    const startDate = new Date('2025-12-13T00:00:00Z'); // Starting from today
    const now = Date.now();
    const totalDuration = milestoneDate.getTime() - startDate.getTime();
    const elapsed = now - startDate.getTime();

    return Math.min(Math.max((elapsed / totalDuration) * 100, 0), 100);
  };

  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());
  const [progress, setProgress] = useState(calculateProgress());

  useEffect(() => {
    const timer = setTimeout(() => {
      setTimeLeft(calculateTimeLeft());
      setProgress(calculateProgress());
    }, 1000);

    return () => clearTimeout(timer);
  });

  const daysRemaining = Math.ceil(
    ((100 - progress) / 100) *
      ((new Date('2026-02-16T17:00:00Z').getTime() -
        new Date('2025-12-13T00:00:00Z').getTime()) /
        (1000 * 60 * 60 * 24))
  );

  if (!timeLeft) {
    return (
      <Card className="group relative h-full overflow-hidden border-dynamic-red/40 bg-linear-to-br from-dynamic-red/10 via-dynamic-orange/5 to-dynamic-yellow/10 shadow-2xl transition-all duration-500 hover:shadow-3xl">
        {/* Festive decorations - lanterns and fireworks */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-2 left-4 h-16 w-16 animate-pulse rounded-full bg-dynamic-yellow/20 blur-2xl sm:h-20 sm:w-20"></div>
          <div
            className="absolute top-6 right-8 h-12 w-12 animate-pulse rounded-full bg-dynamic-red/30 blur-xl sm:h-16 sm:w-16"
            style={{ animationDelay: '0.3s' }}
          ></div>
          <div
            className="absolute bottom-4 left-1/3 h-20 w-20 animate-pulse rounded-full bg-dynamic-orange/20 blur-2xl sm:h-24 sm:w-24"
            style={{ animationDelay: '0.7s' }}
          ></div>
        </div>

        <CardHeader className="relative flex flex-row items-center space-y-0 border-dynamic-red/30 border-b bg-linear-to-r from-dynamic-red/15 via-dynamic-orange/10 to-dynamic-yellow/15 p-3 backdrop-blur-sm sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="rounded-lg bg-linear-to-br from-dynamic-red/30 to-dynamic-orange/20 p-2 shadow-lg ring-2 ring-dynamic-yellow/40 sm:rounded-xl sm:p-2.5">
              <span className="text-xl drop-shadow-lg sm:text-2xl">🧧</span>
            </div>
            <div className="flex min-w-0 flex-col">
              <CardTitle className="line-clamp-1 font-bold text-base tracking-tight sm:text-lg">
                {t('complete_title')} 🎊
              </CardTitle>
              <span className="line-clamp-1 font-medium text-[10px] text-dynamic-red/80 sm:text-xs">
                {t('complete_subtitle')} 🐍
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="relative h-full space-y-3 p-3 sm:space-y-4 sm:p-4">
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center justify-center gap-2 sm:gap-3">
              <span className="text-2xl sm:text-4xl">🎆</span>
              <p className="bg-linear-to-r from-dynamic-red via-dynamic-orange to-dynamic-yellow bg-clip-text font-black text-lg text-transparent sm:text-xl">
                {t('title')}
              </p>
              <span className="text-2xl sm:text-4xl">🎆</span>
            </div>
            <div className="space-y-2 rounded-xl border-2 border-dynamic-yellow/30 bg-linear-to-br from-dynamic-red/10 via-dynamic-orange/5 to-dynamic-yellow/10 p-3 shadow-inner sm:space-y-3 sm:rounded-2xl sm:p-5">
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div className="flex flex-col items-center gap-1 rounded-lg bg-dynamic-red/10 p-2 transition-transform hover:scale-105 sm:gap-2 sm:rounded-xl sm:p-3">
                  <span className="text-2xl sm:text-3xl">🌸</span>
                  <p className="text-center font-bold text-[10px] text-dynamic-red sm:text-xs">
                    {t('hoa_dao')}
                  </p>
                </div>
                <div className="flex flex-col items-center gap-1 rounded-lg bg-dynamic-yellow/10 p-2 transition-transform hover:scale-105 sm:gap-2 sm:rounded-xl sm:p-3">
                  <span className="text-2xl sm:text-3xl">🧧</span>
                  <p className="text-center font-bold text-[10px] text-dynamic-orange sm:text-xs">
                    {t('li_xi')}
                  </p>
                </div>
                <div className="flex flex-col items-center gap-1 rounded-lg bg-dynamic-orange/10 p-2 transition-transform hover:scale-105 sm:gap-2 sm:rounded-xl sm:p-3">
                  <span className="text-2xl sm:text-3xl">🍚</span>
                  <p className="text-center font-bold text-[10px] text-dynamic-red sm:text-xs">
                    {t('banh_chung')}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-center gap-1 rounded-lg bg-linear-to-r from-dynamic-red/15 via-dynamic-orange/10 to-dynamic-yellow/15 py-3 sm:gap-2 sm:rounded-xl sm:py-4">
                <span className="text-xl sm:text-2xl">🐍</span>
                <p className="bg-linear-to-r from-dynamic-red to-dynamic-orange bg-clip-text text-center font-bold text-sm text-transparent italic sm:text-base">
                  {t('year_of_snake')}
                </p>
                <span className="text-xl sm:text-2xl">✨</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const TimeSlot = ({
    value,
    unit,
    viet,
  }: {
    value: number;
    unit: string;
    viet: string;
  }) => (
    <div className="group/slot flex flex-col items-center space-y-0.5 sm:space-y-1">
      <div className="relative rounded-lg border-2 border-dynamic-red/40 bg-linear-to-br from-dynamic-red/20 via-dynamic-orange/15 to-dynamic-yellow/20 px-2 py-1.5 shadow-lg transition-all duration-300 hover:scale-110 hover:border-dynamic-yellow/60 hover:shadow-2xl sm:rounded-xl sm:px-4 sm:py-3">
        <div className="absolute inset-0 rounded-lg bg-linear-to-br from-dynamic-yellow/30 to-transparent opacity-0 transition-opacity duration-300 group-hover/slot:opacity-100 sm:rounded-xl"></div>
        <div className="relative font-black text-dynamic-red text-lg tabular-nums drop-shadow-md sm:text-2xl md:text-3xl">
          {String(value).padStart(2, '0')}
        </div>
      </div>
      <div className="flex flex-col items-center">
        <p className="font-bold text-[8px] text-dynamic-red/80 uppercase tracking-wider sm:text-[10px] md:text-xs">
          {unit}
        </p>
        <p className="font-medium text-[8px] text-dynamic-orange/70 sm:text-[10px] md:text-xs">
          {viet}
        </p>
      </div>
    </div>
  );

  return (
    <Card className="group relative h-full overflow-hidden border-dynamic-red/40 bg-linear-to-br from-dynamic-red/10 via-dynamic-orange/5 to-dynamic-yellow/10 shadow-2xl transition-all duration-500 hover:shadow-3xl">
      {/* Festive background decorations */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 left-0 h-24 w-24 animate-pulse rounded-full bg-dynamic-yellow/10 blur-3xl sm:h-32 sm:w-32"></div>
        <div
          className="absolute right-0 bottom-0 h-32 w-32 animate-pulse rounded-full bg-dynamic-red/10 blur-3xl sm:h-40 sm:w-40"
          style={{ animationDelay: '0.5s' }}
        ></div>
        <div
          className="absolute top-1/2 left-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 transform animate-pulse rounded-full bg-dynamic-orange/10 blur-2xl sm:h-24 sm:w-24"
          style={{ animationDelay: '1s' }}
        ></div>
      </div>

      <CardHeader className="relative flex flex-row items-center space-y-0 border-dynamic-red/30 border-b bg-linear-to-r from-dynamic-red/15 via-dynamic-orange/10 to-dynamic-yellow/15 p-3 backdrop-blur-sm sm:p-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="rounded-lg bg-linear-to-br from-dynamic-red/30 to-dynamic-orange/20 p-2 shadow-lg ring-2 ring-dynamic-yellow/40 sm:rounded-xl sm:p-2.5">
            <span className="text-lg drop-shadow-lg sm:text-xl">🧧</span>
          </div>
          <div className="flex min-w-0 flex-col">
            <CardTitle className="line-clamp-1 font-bold text-sm tracking-tight sm:text-base md:text-lg">
              {t('title')} 🎊
            </CardTitle>
            <span className="line-clamp-1 font-medium text-[10px] text-dynamic-red/70 sm:text-xs">
              {t('subtitle')} 🐍
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative h-full space-y-3 p-3 sm:space-y-4 sm:p-4">
        <div className="space-y-3 sm:space-y-4">
          <div className="text-center">
            <div className="mb-3 flex justify-center gap-1 sm:mb-4 sm:gap-2 md:gap-3">
              <TimeSlot
                value={timeLeft.days}
                unit={t('days')}
                viet={t('days_viet')}
              />
              <div className="flex items-center font-black text-dynamic-red/50 text-lg sm:text-xl">
                :
              </div>
              <TimeSlot
                value={timeLeft.hours}
                unit={t('hours')}
                viet={t('hours_viet')}
              />
              <div className="flex items-center font-black text-dynamic-red/50 text-lg sm:text-xl">
                :
              </div>
              <TimeSlot
                value={timeLeft.minutes}
                unit={t('minutes')}
                viet={t('minutes_viet')}
              />
              <div className="flex items-center font-black text-dynamic-red/50 text-lg sm:text-xl">
                :
              </div>
              <TimeSlot
                value={timeLeft.seconds}
                unit={t('seconds')}
                viet={t('seconds_viet')}
              />
            </div>
          </div>

          <div className="space-y-2 rounded-xl border-2 border-dynamic-red/30 bg-linear-to-br from-dynamic-red/10 via-dynamic-orange/5 to-dynamic-yellow/10 p-3 shadow-xl backdrop-blur-sm sm:space-y-3 sm:rounded-2xl sm:p-4">
            <div className="flex flex-col gap-1 border-dynamic-red/20 border-b pb-2 sm:flex-row sm:items-center sm:gap-2 sm:pb-3">
              <div className="flex items-center gap-1 sm:gap-2">
                <span className="text-lg sm:text-xl">🎉</span>
                <h3 className="bg-linear-to-r from-dynamic-red to-dynamic-orange bg-clip-text font-black text-transparent text-xs uppercase tracking-wide sm:text-sm md:text-base">
                  {t('event_title')}
                </h3>
              </div>
              <span className="font-bold text-[10px] text-dynamic-red/70 sm:ml-auto sm:text-xs md:text-sm">
                {t('event_date')}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-sm sm:grid-cols-4 sm:gap-2">
              <div className="flex flex-col items-center gap-1 rounded-lg bg-dynamic-red/10 p-2 transition-all duration-300 hover:scale-105 hover:bg-dynamic-red/15 sm:gap-1.5 sm:rounded-xl sm:p-3">
                <span className="text-xl sm:text-2xl">🌸</span>
                <p className="text-center font-bold text-[10px] text-dynamic-red sm:text-xs">
                  {t('hoa_mai')}
                </p>
              </div>
              <div className="flex flex-col items-center gap-1 rounded-lg bg-dynamic-yellow/10 p-2 transition-all duration-300 hover:scale-105 hover:bg-dynamic-yellow/15 sm:gap-1.5 sm:rounded-xl sm:p-3">
                <span className="text-xl sm:text-2xl">🧧</span>
                <p className="text-center font-bold text-[10px] text-dynamic-orange sm:text-xs">
                  {t('li_xi')}
                </p>
              </div>
              <div className="flex flex-col items-center gap-1 rounded-lg bg-dynamic-orange/10 p-2 transition-all duration-300 hover:scale-105 hover:bg-dynamic-orange/15 sm:gap-1.5 sm:rounded-xl sm:p-3">
                <span className="text-xl sm:text-2xl">🍚</span>
                <p className="text-center font-bold text-[10px] text-dynamic-red sm:text-xs">
                  {t('banh_chung')}
                </p>
              </div>
              <div className="flex flex-col items-center gap-1 rounded-lg bg-dynamic-red/10 p-2 transition-all duration-300 hover:scale-105 hover:bg-dynamic-red/15 sm:gap-1.5 sm:rounded-xl sm:p-3">
                <span className="text-xl sm:text-2xl">🏮</span>
                <p className="text-center font-bold text-[10px] text-dynamic-orange sm:text-xs">
                  {t('den_long')}
                </p>
              </div>
            </div>

            <div className="space-y-1.5 border-dynamic-red/20 border-t pt-2 sm:space-y-2 sm:pt-3">
              <div className="flex items-center justify-between text-[10px] sm:text-xs md:text-sm">
                <div className="flex items-center gap-1 sm:gap-1.5">
                  <span className="text-sm sm:text-base md:text-lg">🎊</span>
                  <span className="font-bold text-dynamic-red/90">
                    {t('countdown_progress')}
                  </span>
                </div>
                <span className="font-black text-dynamic-red text-sm sm:text-base md:text-lg">
                  {progress.toFixed(1)}%
                </span>
              </div>
              <div className="relative h-2.5 overflow-hidden rounded-full bg-dynamic-gray/10 shadow-inner sm:h-3 md:h-4">
                <div
                  className="h-full bg-linear-to-r from-dynamic-red via-dynamic-orange to-dynamic-yellow shadow-lg transition-all duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
                <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/30 to-transparent"></div>
              </div>
              <p className="flex items-start gap-1 text-[10px] text-dynamic-red/70 sm:items-center sm:gap-1.5 sm:text-xs">
                <span className="shrink-0">🐍</span>
                <span>
                  {progress < 100
                    ? t('days_until_tet', { count: daysRemaining })
                    : t('happy_new_year') + ' 🎆'}
                </span>
              </p>
            </div>

            <div className="rounded-lg bg-linear-to-r from-dynamic-red/15 via-dynamic-orange/10 to-dynamic-yellow/15 p-2.5 sm:rounded-xl sm:p-3 md:p-4">
              <p className="text-center font-bold text-[10px] text-dynamic-red sm:text-xs md:text-sm">
                {t('new_year_wish')} 🧧✨
              </p>
              <p className="mt-0.5 text-center text-[9px] text-dynamic-orange/70 sm:mt-1 sm:text-[10px] md:text-xs">
                {t('new_year_wish_en')}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const CountdownJT26 = () => {
  const t = useTranslations('dashboard.japan_trip_countdown');

  const calculateTimeLeft = () => {
    // March 31, 2026 at 11:59 PM Vietnam time (GMT+7)
    const milestoneDate = new Date('2026-03-31T16:59:00Z'); // 11:59 PM GMT+7 = 4:59 PM UTC
    const difference = milestoneDate.getTime() - Date.now();

    if (difference > 0) {
      return {
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        seconds: Math.floor((difference / 1000) % 60),
      };
    }

    return null;
  };

  const calculateProgress = () => {
    // March 31, 2026 at 11:59 PM Vietnam time (GMT+7)
    const milestoneDate = new Date('2026-03-31T16:59:00Z');
    const startDate = new Date('2025-11-07T00:00:00Z'); // Starting from today
    const now = Date.now();
    const totalDuration = milestoneDate.getTime() - startDate.getTime();
    const elapsed = now - startDate.getTime();

    return Math.min(Math.max((elapsed / totalDuration) * 100, 0), 100);
  };

  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());
  const [progress, setProgress] = useState(calculateProgress());

  useEffect(() => {
    const timer = setTimeout(() => {
      setTimeLeft(calculateTimeLeft());
      setProgress(calculateProgress());
    }, 1000);

    return () => clearTimeout(timer);
  });

  const daysRemaining = Math.ceil(
    ((100 - progress) / 100) *
      ((new Date('2026-03-31T16:59:00Z').getTime() -
        new Date('2025-11-07T00:00:00Z').getTime()) /
        (1000 * 60 * 60 * 24))
  );

  if (!timeLeft) {
    return (
      <Card className="group relative h-full overflow-hidden border-dynamic-pink/30 bg-linear-to-br from-dynamic-pink/5 via-dynamic-rose/10 to-dynamic-red/5 shadow-xl transition-all duration-300 hover:shadow-2xl">
        {/* Cherry blossom petals decoration */}
        <div className="pointer-events-none absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 h-full w-full">
            <div className="absolute top-4 right-4 h-12 w-12 animate-pulse rounded-full bg-dynamic-pink/30 blur-xl sm:h-16 sm:w-16"></div>
            <div
              className="absolute right-12 bottom-8 h-16 w-16 animate-pulse rounded-full bg-dynamic-rose/30 blur-xl sm:h-20 sm:w-20"
              style={{ animationDelay: '0.5s' }}
            ></div>
            <div
              className="absolute top-16 right-20 h-10 w-10 animate-pulse rounded-full bg-dynamic-pink/40 blur-lg sm:h-12 sm:w-12"
              style={{ animationDelay: '1s' }}
            ></div>
          </div>
        </div>

        <CardHeader className="relative flex flex-row items-center space-y-0 border-dynamic-pink/30 border-b bg-linear-to-r from-dynamic-pink/10 via-dynamic-rose/10 to-dynamic-red/10 p-3 backdrop-blur-sm sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="rounded-lg bg-linear-to-br from-dynamic-pink/20 to-dynamic-rose/20 p-1.5 shadow-lg ring-2 ring-dynamic-pink/30 sm:rounded-xl sm:p-2">
              <Clock className="h-4 w-4 text-dynamic-pink drop-shadow-lg sm:h-5 sm:w-5" />
            </div>
            <div className="flex min-w-0 flex-col">
              <CardTitle className="line-clamp-1 font-bold text-sm tracking-tight sm:text-base md:text-lg">
                {t('complete_title')} 🌸
              </CardTitle>
              <span className="line-clamp-1 font-medium text-[10px] text-dynamic-pink/70 sm:text-xs">
                {t('complete_subtitle')}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="relative h-full space-y-3 p-3 sm:space-y-4 sm:p-4">
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="text-2xl sm:text-4xl">🌸</div>
              <p className="font-bold text-dynamic-pink text-sm sm:text-lg">
                日本への旅 - Journey to Japan Achieved!
              </p>
            </div>
            <div className="space-y-2 rounded-lg border border-dynamic-pink/20 bg-linear-to-br from-dynamic-pink/10 to-dynamic-rose/5 p-3 shadow-inner sm:space-y-3 sm:rounded-xl sm:p-5">
              <div className="flex items-start gap-2 sm:gap-3">
                <span className="text-lg sm:text-2xl">✅</span>
                <div>
                  <p className="font-bold text-dynamic-pink text-xs sm:text-base">
                    {t('profitability_achieved')}
                  </p>
                  <p className="text-[10px] text-dynamic-gray/70 sm:text-sm">
                    {t('profitability_achieved_desc')}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2 sm:gap-3">
                <span className="text-lg sm:text-2xl">✅</span>
                <div>
                  <p className="font-bold text-dynamic-pink text-xs sm:text-base">
                    {t('team_earned')}
                  </p>
                  <p className="text-[10px] text-dynamic-gray/70 sm:text-sm">
                    {t('team_earned_desc')}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2 sm:gap-3">
                <span className="text-lg sm:text-2xl">✅</span>
                <div>
                  <p className="font-bold text-dynamic-pink text-xs sm:text-base">
                    {t('japan_trip_realized')}
                  </p>
                  <p className="text-[10px] text-dynamic-gray/70 sm:text-sm">
                    {t('japan_trip_realized_desc')} 🇯🇵
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-center gap-1 rounded-lg bg-linear-to-r from-dynamic-pink/10 to-dynamic-rose/10 py-2 sm:gap-2 sm:py-3">
              <span className="text-lg sm:text-2xl">🎌</span>
              <p className="text-center font-semibold text-dynamic-pink/80 text-xs italic sm:text-base">
                {t('celebration_message')}
              </p>
              <span className="text-lg sm:text-2xl">🌸</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const TimeSlot = ({
    value,
    unit,
    kanji,
  }: {
    value: number;
    unit: string;
    kanji: string;
  }) => (
    <div className="group/slot flex flex-col items-center space-y-0.5 sm:space-y-1">
      <div className="relative rounded-lg border-2 border-dynamic-pink/30 bg-linear-to-br from-dynamic-pink/15 via-dynamic-rose/10 to-dynamic-red/15 px-2 py-1.5 shadow-lg transition-all duration-300 hover:scale-105 hover:border-dynamic-pink/50 hover:shadow-xl sm:rounded-xl sm:px-4 sm:py-3">
        <div className="absolute inset-0 rounded-lg bg-linear-to-br from-dynamic-pink/20 to-transparent opacity-0 transition-opacity duration-300 group-hover/slot:opacity-100 sm:rounded-xl"></div>
        <div className="relative font-black text-dynamic-pink text-lg tabular-nums drop-shadow-md transition-all duration-200 sm:text-2xl md:text-3xl">
          {String(value).padStart(2, '0')}
        </div>
      </div>
      <div className="flex flex-col items-center">
        <p className="font-bold text-[8px] text-dynamic-pink/80 uppercase tracking-wider sm:text-[10px] md:text-xs">
          {unit}
        </p>
        <p className="font-medium text-[8px] text-dynamic-pink/60 sm:text-[10px] md:text-xs">
          {kanji}
        </p>
      </div>
    </div>
  );

  return (
    <Card className="group relative h-full overflow-hidden border-dynamic-pink/30 bg-linear-to-br from-dynamic-pink/5 via-dynamic-rose/10 to-dynamic-red/5 shadow-xl transition-all duration-300 hover:shadow-2xl">
      {/* Cherry blossom petals decoration */}
      <div className="pointer-events-none absolute inset-0 opacity-5">
        <div className="absolute top-0 right-0 h-full w-full">
          <div className="absolute top-4 right-4 h-16 w-16 animate-pulse rounded-full bg-dynamic-pink/40 blur-2xl sm:h-24 sm:w-24"></div>
          <div
            className="absolute right-12 bottom-8 h-24 w-24 animate-pulse rounded-full bg-dynamic-rose/40 blur-2xl sm:h-32 sm:w-32"
            style={{ animationDelay: '0.5s' }}
          ></div>
          <div
            className="absolute top-20 right-20 h-12 w-12 animate-pulse rounded-full bg-dynamic-pink/50 blur-xl sm:h-16 sm:w-16"
            style={{ animationDelay: '1s' }}
          ></div>
        </div>
      </div>

      <CardHeader className="relative flex flex-row items-center space-y-0 border-dynamic-pink/30 border-b bg-linear-to-r from-dynamic-pink/10 via-dynamic-rose/10 to-dynamic-red/10 p-3 backdrop-blur-sm sm:p-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="rounded-lg bg-linear-to-br from-dynamic-pink/20 to-dynamic-rose/20 p-1.5 shadow-lg ring-2 ring-dynamic-pink/30 sm:rounded-xl sm:p-2">
            <Clock className="h-4 w-4 animate-pulse text-dynamic-pink drop-shadow-lg sm:h-5 sm:w-5" />
          </div>
          <div className="flex min-w-0 flex-col">
            <CardTitle className="line-clamp-1 font-bold text-sm tracking-tight sm:text-base md:text-lg">
              {t('title')} 🌸 {t('subtitle')}
            </CardTitle>
            <span className="line-clamp-1 font-medium text-[10px] text-dynamic-pink/70 sm:text-xs">
              {t('subtitle_jp')}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative h-full space-y-3 p-3 sm:space-y-4 sm:p-4">
        <div className="space-y-3 sm:space-y-4">
          <div className="text-center">
            <div className="mb-3 flex justify-center gap-1 sm:mb-4 sm:gap-2 md:gap-3">
              <TimeSlot
                value={timeLeft.days}
                unit={t('days')}
                kanji={t('days_jp')}
              />
              <div className="flex items-center font-black text-dynamic-pink/40 text-lg sm:text-xl">
                :
              </div>
              <TimeSlot
                value={timeLeft.hours}
                unit={t('hours')}
                kanji={t('hours_jp')}
              />
              <div className="flex items-center font-black text-dynamic-pink/40 text-lg sm:text-xl">
                :
              </div>
              <TimeSlot
                value={timeLeft.minutes}
                unit={t('minutes')}
                kanji={t('minutes_jp')}
              />
              <div className="flex items-center font-black text-dynamic-pink/40 text-lg sm:text-xl">
                :
              </div>
              <TimeSlot
                value={timeLeft.seconds}
                unit={t('seconds')}
                kanji={t('seconds_jp')}
              />
            </div>
          </div>

          <div className="space-y-2 rounded-lg border-2 border-dynamic-pink/20 bg-linear-to-br from-dynamic-pink/10 via-dynamic-rose/5 to-dynamic-red/10 p-3 shadow-lg backdrop-blur-sm sm:space-y-3 sm:rounded-xl sm:p-4">
            <div className="flex flex-col gap-1 border-dynamic-pink/20 border-b pb-2 sm:flex-row sm:items-center sm:gap-2 sm:pb-3">
              <div className="flex items-center gap-1 sm:gap-2">
                <span className="text-lg sm:text-xl">🎌</span>
                <h3 className="font-black text-dynamic-pink text-xs uppercase tracking-wide sm:text-sm md:text-base">
                  {t('event_title')}
                </h3>
              </div>
              <span className="font-bold text-[10px] text-dynamic-pink/70 sm:ml-auto sm:text-xs md:text-sm">
                {t('event_date')}
              </span>
            </div>
            <div className="space-y-1.5 text-sm sm:space-y-2">
              <div className="flex items-start gap-1.5 rounded-lg bg-dynamic-pink/5 p-2 transition-all duration-200 hover:bg-dynamic-pink/10 sm:gap-2.5 sm:p-3">
                <span className="text-base sm:text-lg md:text-xl">💰</span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-[10px] text-dynamic-pink sm:text-xs md:text-sm">
                    {t('ultimate_goal')}
                  </p>
                  <p className="text-[9px] text-dynamic-gray/80 sm:text-[10px] md:text-xs">
                    {t('ultimate_goal_desc')}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-1.5 rounded-lg bg-dynamic-pink/5 p-2 transition-all duration-200 hover:bg-dynamic-pink/10 sm:gap-2.5 sm:p-3">
                <span className="text-base sm:text-lg md:text-xl">👥</span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-[10px] text-dynamic-pink sm:text-xs md:text-sm">
                    {t('mission')}
                  </p>
                  <p className="text-[9px] text-dynamic-gray/80 sm:text-[10px] md:text-xs">
                    {t('mission_desc')}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-1.5 rounded-lg bg-dynamic-pink/5 p-2 transition-all duration-200 hover:bg-dynamic-pink/10 sm:gap-2.5 sm:p-3">
                <span className="text-base sm:text-lg md:text-xl">🗾</span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-[10px] text-dynamic-pink sm:text-xs md:text-sm">
                    {t('dream')}
                  </p>
                  <p className="text-[9px] text-dynamic-gray/80 sm:text-[10px] md:text-xs">
                    {t('dream_desc')} 🇯🇵
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-1.5 border-dynamic-pink/20 border-t pt-2 sm:space-y-2 sm:pt-3">
              <div className="flex items-center justify-between text-[10px] sm:text-xs md:text-sm">
                <div className="flex items-center gap-1 sm:gap-1.5">
                  <span className="text-sm sm:text-base md:text-lg">🌸</span>
                  <span className="font-bold text-dynamic-pink/90">
                    {t('journey_progress')}
                  </span>
                </div>
                <span className="font-black text-dynamic-pink text-sm sm:text-base md:text-lg">
                  {progress.toFixed(1)}%
                </span>
              </div>
              <div className="relative h-2 overflow-hidden rounded-full bg-dynamic-gray/10 shadow-inner sm:h-2.5 md:h-3">
                <div
                  className="h-full bg-linear-to-r from-dynamic-pink via-dynamic-rose to-dynamic-red shadow-lg transition-all duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
                <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/20 to-transparent"></div>
              </div>
              <p className="flex items-start gap-1 text-[9px] text-dynamic-pink/70 sm:items-center sm:gap-1.5 sm:text-[10px] md:text-xs">
                <span className="shrink-0">🌸</span>
                <span>
                  {progress < 100
                    ? t('days_until_japan', { count: daysRemaining })
                    : t('time_to_go') + ' 🎌'}
                </span>
              </p>
            </div>

            <div className="rounded-lg bg-linear-to-r from-dynamic-pink/10 to-dynamic-rose/10 p-2 sm:p-2.5 md:p-3">
              <p className="text-center font-bold text-[9px] text-dynamic-pink sm:text-[10px] md:text-xs">
                {t('motivation')} 🌸
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const Countdown = () => {
  return (
    <>
      <CountdownTet2026 />
      <CountdownJT26 />
    </>
  );
};

export default Countdown;
