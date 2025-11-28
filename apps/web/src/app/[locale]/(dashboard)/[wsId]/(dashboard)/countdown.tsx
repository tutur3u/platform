'use client';

import { Clock } from '@tuturuuu/icons';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { useEffect, useState } from 'react';

const CountdownDD = () => {
  const calculateTimeLeft = () => {
    // December 4, 2025 at 11:59 PM Vietnam time (GMT+7)
    const milestoneDate = new Date('2025-12-04T16:59:00Z'); // 11:59 PM GMT+7 = 4:59 PM UTC
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
    // December 4, 2025 at 11:59 PM Vietnam time (GMT+7)
    const milestoneDate = new Date('2025-12-04T16:59:00Z');
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

  if (!timeLeft) {
    return (
      <Card className="group relative mb-4 h-full overflow-hidden border-dynamic-cyan/30 bg-linear-to-br from-dynamic-cyan/5 via-dynamic-blue/10 to-dynamic-teal/5 shadow-xl transition-all duration-300 hover:shadow-2xl">
        {/* Animated wave decoration */}
        <div className="pointer-events-none absolute inset-0 opacity-10">
          <div className="absolute bottom-0 left-0 h-32 w-full bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik0wLDY0IEMxNjAsNjQgMTYwLDMyIDMyMCwzMiBTNDgwLDY0IDY0MCw2NCBTODU2LDMyIDk2MCwzMiBWMTI4IEgwIFoiIGZpbGw9IiMwMGJjZDQiLz48L3N2Zz4=')] bg-repeat-x opacity-50"></div>
        </div>

        <CardHeader className="relative flex flex-row items-center space-y-0 border-dynamic-cyan/30 border-b bg-linear-to-r from-dynamic-cyan/10 via-dynamic-blue/10 to-dynamic-teal/10 p-4 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-linear-to-br from-dynamic-cyan/20 to-dynamic-blue/20 p-2 shadow-lg ring-2 ring-dynamic-cyan/30">
              <Clock className="h-5 w-5 text-dynamic-cyan drop-shadow-lg" />
            </div>
            <div className="flex flex-col">
              <CardTitle className="line-clamp-1 font-bold text-lg tracking-tight">
                Operation DD Complete! ⛵
              </CardTitle>
              <span className="font-medium text-dynamic-cyan/70 text-xs">
                Mission Accomplished
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="relative h-full space-y-6 p-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="text-4xl">🌊</div>
              <p className="font-bold text-dynamic-cyan text-lg">
                SPARK Hub Demo Day - We've Set Sail!
              </p>
            </div>
            <div className="space-y-3 rounded-xl border border-dynamic-cyan/20 bg-linear-to-br from-dynamic-cyan/10 to-dynamic-blue/5 p-5 shadow-inner">
              <div className="flex items-start gap-3">
                <span className="text-2xl">✅</span>
                <div>
                  <p className="font-bold text-dynamic-cyan">
                    MVP Product Delivered
                  </p>
                  <p className="text-dynamic-gray/70 text-sm">
                    Tudo fully completed and ready for the voyage
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-2xl">✅</span>
                <div>
                  <p className="font-bold text-dynamic-cyan">
                    Pitch Deck Refined
                  </p>
                  <p className="text-dynamic-gray/70 text-sm">
                    Navigation charts prepared for presentation
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-2xl">✅</span>
                <div>
                  <p className="font-bold text-dynamic-cyan">Demo Delivered</p>
                  <p className="text-dynamic-gray/70 text-sm">
                    Product showcased successfully to the crew
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-center gap-2 rounded-lg bg-linear-to-r from-dynamic-cyan/10 to-dynamic-blue/10 py-3">
              <span className="text-2xl">⛵</span>
              <p className="font-semibold text-dynamic-cyan/80 italic">
                Tuturuuu has sailed into the big sea!
              </p>
              <span className="text-2xl">🌊</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const TimeSlot = ({ value, unit }: { value: number; unit: string }) => (
    <div className="group/slot flex flex-col items-center space-y-1 sm:space-y-2">
      <div className="relative rounded-lg border-2 border-dynamic-cyan/30 bg-linear-to-br from-dynamic-cyan/15 via-dynamic-blue/10 to-dynamic-teal/15 px-2 py-1.5 shadow-lg transition-all duration-300 hover:scale-105 hover:border-dynamic-cyan/50 hover:shadow-xl sm:rounded-xl sm:px-4 sm:py-3">
        <div className="absolute inset-0 rounded-lg bg-linear-to-br from-dynamic-cyan/20 to-transparent opacity-0 transition-opacity duration-300 group-hover/slot:opacity-100 sm:rounded-xl"></div>
        <div className="relative font-black text-2xl text-dynamic-cyan tabular-nums drop-shadow-md transition-all duration-200 sm:text-3xl md:text-4xl">
          {String(value).padStart(2, '0')}
        </div>
      </div>
      <p className="font-bold text-[10px] text-dynamic-cyan/80 uppercase tracking-wider sm:text-xs sm:tracking-widest">
        {unit}
      </p>
    </div>
  );

  return (
    <Card className="group relative mb-4 h-full overflow-hidden border-dynamic-cyan/30 bg-linear-to-br from-dynamic-cyan/5 via-dynamic-blue/10 to-dynamic-teal/5 shadow-xl transition-all duration-300 hover:shadow-2xl">
      <CardHeader className="relative flex flex-row items-center space-y-0 border-dynamic-cyan/30 border-b bg-linear-to-r from-dynamic-cyan/10 via-dynamic-blue/10 to-dynamic-teal/10 p-4 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-linear-to-br from-dynamic-cyan/20 to-dynamic-blue/20 p-2 shadow-lg ring-2 ring-dynamic-cyan/30">
            <Clock className="h-5 w-5 animate-pulse text-dynamic-cyan drop-shadow-lg" />
          </div>
          <div className="flex flex-col">
            <CardTitle className="line-clamp-1 font-bold text-lg tracking-tight">
              Operation DD ⛵ Sailing to the Big Sea
            </CardTitle>
            <span className="font-medium text-dynamic-cyan/70 text-xs">
              Demo Day Mission
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative h-full space-y-6 p-6">
        <div className="space-y-5">
          <div className="text-center">
            <div className="mb-4 flex justify-center gap-1.5 sm:mb-6 sm:gap-3">
              <TimeSlot value={timeLeft.days} unit="Days" />
              <div className="flex items-center font-black text-dynamic-cyan/40 text-xl sm:text-2xl md:text-3xl">
                :
              </div>
              <TimeSlot value={timeLeft.hours} unit="Hours" />
              <div className="flex items-center font-black text-dynamic-cyan/40 text-xl sm:text-2xl md:text-3xl">
                :
              </div>
              <TimeSlot value={timeLeft.minutes} unit="Minutes" />
              <div className="flex items-center font-black text-dynamic-cyan/40 text-xl sm:text-2xl md:text-3xl">
                :
              </div>
              <TimeSlot value={timeLeft.seconds} unit="Seconds" />
            </div>
          </div>

          <div className="space-y-3 rounded-xl border-2 border-dynamic-cyan/20 bg-linear-to-br from-dynamic-cyan/10 via-dynamic-blue/5 to-dynamic-teal/10 p-3 shadow-lg backdrop-blur-sm sm:space-y-4 sm:p-5">
            <div className="flex flex-col gap-2 border-dynamic-cyan/20 border-b pb-2 sm:flex-row sm:items-center sm:pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl sm:text-2xl">📢</span>
                <h3 className="font-black text-dynamic-cyan text-sm uppercase tracking-wide sm:text-base">
                  SPARK Hub Demo Day
                </h3>
              </div>
              <span className="font-bold text-dynamic-cyan/70 text-xs sm:ml-auto sm:text-sm">
                Dec 4, 2025
              </span>
            </div>
            <div className="space-y-2 text-sm sm:space-y-3">
              <div className="flex items-start gap-2 rounded-lg bg-dynamic-cyan/5 p-2.5 transition-all duration-200 hover:bg-dynamic-cyan/10 sm:gap-3 sm:p-3">
                <span className="text-lg sm:text-xl">⚓</span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-dynamic-cyan text-sm sm:text-base">
                    Set Sail
                  </p>
                  <p className="text-dynamic-gray/80 text-xs sm:text-sm">
                    Fully complete our deliverable MVP product (Tudo)
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-lg bg-dynamic-cyan/5 p-2.5 transition-all duration-200 hover:bg-dynamic-cyan/10 sm:gap-3 sm:p-3">
                <span className="text-lg sm:text-xl">🧭</span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-dynamic-cyan text-sm sm:text-base">
                    Navigate
                  </p>
                  <p className="text-dynamic-gray/80 text-xs sm:text-sm">
                    Refine our Pitch Deck for maximum impact
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-lg bg-dynamic-cyan/5 p-2.5 transition-all duration-200 hover:bg-dynamic-cyan/10 sm:gap-3 sm:p-3">
                <span className="text-lg sm:text-xl">🗺️</span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-dynamic-cyan text-sm sm:text-base">
                    Chart Course
                  </p>
                  <p className="text-dynamic-gray/80 text-xs sm:text-sm">
                    Give a compelling demo showcasing our products
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2 border-dynamic-cyan/20 border-t pt-3 sm:pt-4">
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="text-base sm:text-lg">🌊</span>
                  <span className="font-bold text-dynamic-cyan/90">
                    Voyage Progress
                  </span>
                </div>
                <span className="font-black text-base text-dynamic-cyan sm:text-lg">
                  {progress.toFixed(1)}%
                </span>
              </div>
              <div className="relative h-2.5 overflow-hidden rounded-full bg-dynamic-gray/10 shadow-inner sm:h-3">
                <div
                  className="h-full bg-linear-to-r from-dynamic-cyan via-dynamic-blue to-dynamic-teal shadow-lg transition-all duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
                <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/20 to-transparent"></div>
              </div>
              <p className="flex items-start gap-1 text-[11px] text-dynamic-cyan/70 sm:items-center sm:gap-1.5 sm:text-xs">
                <span className="shrink-0">⛵</span>
                <span>
                  {progress < 100
                    ? `${Math.ceil(((100 - progress) / 100) * ((new Date('2025-12-04T16:59:00Z').getTime() - new Date('2025-11-07T00:00:00Z').getTime()) / (1000 * 60 * 60 * 24)))} days until we sail to the big sea`
                    : 'Time to set sail! 🌊'}
                </span>
              </p>
            </div>

            <div className="rounded-lg bg-linear-to-r from-dynamic-cyan/10 to-dynamic-blue/10 p-2.5 sm:p-3">
              <p className="text-center font-bold text-dynamic-cyan text-xs sm:text-sm">
                Ready to sail Tuturuuu into the big sea! ⛵ 🌊
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const CountdownJT26 = () => {
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

  if (!timeLeft) {
    return (
      <Card className="group relative mb-4 h-full overflow-hidden border-dynamic-pink/30 bg-linear-to-br from-dynamic-pink/5 via-dynamic-rose/10 to-dynamic-red/5 shadow-xl transition-all duration-300 hover:shadow-2xl">
        {/* Cherry blossom petals decoration */}
        <div className="pointer-events-none absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 h-full w-full">
            <div className="absolute top-4 right-4 h-16 w-16 animate-pulse rounded-full bg-dynamic-pink/30 blur-xl"></div>
            <div
              className="absolute right-12 bottom-8 h-20 w-20 animate-pulse rounded-full bg-dynamic-rose/30 blur-xl"
              style={{ animationDelay: '0.5s' }}
            ></div>
            <div
              className="absolute top-16 right-20 h-12 w-12 animate-pulse rounded-full bg-dynamic-pink/40 blur-lg"
              style={{ animationDelay: '1s' }}
            ></div>
          </div>
        </div>

        <CardHeader className="relative flex flex-row items-center space-y-0 border-dynamic-pink/30 border-b bg-linear-to-r from-dynamic-pink/10 via-dynamic-rose/10 to-dynamic-red/10 p-4 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-linear-to-br from-dynamic-pink/20 to-dynamic-rose/20 p-2 shadow-lg ring-2 ring-dynamic-pink/30">
              <Clock className="h-5 w-5 text-dynamic-pink drop-shadow-lg" />
            </div>
            <div className="flex flex-col">
              <CardTitle className="line-clamp-1 font-bold text-lg tracking-tight">
                Operation JT26 Complete! 🌸
              </CardTitle>
              <span className="font-medium text-dynamic-pink/70 text-xs">
                夢が叶いました (Dream Achieved)
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="relative h-full space-y-6 p-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="text-4xl">🌸</div>
              <p className="font-bold text-dynamic-pink text-lg">
                日本への旅 - Journey to Japan Achieved!
              </p>
            </div>
            <div className="space-y-3 rounded-xl border border-dynamic-pink/20 bg-linear-to-br from-dynamic-pink/10 to-dynamic-rose/5 p-5 shadow-inner">
              <div className="flex items-start gap-3">
                <span className="text-2xl">✅</span>
                <div>
                  <p className="font-bold text-dynamic-pink">
                    Profitability Achieved
                  </p>
                  <p className="text-dynamic-gray/70 text-sm">
                    Tuturuuu is sustainable and thriving
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-2xl">✅</span>
                <div>
                  <p className="font-bold text-dynamic-pink">
                    Team Earned Together
                  </p>
                  <p className="text-dynamic-gray/70 text-sm">
                    Sufficient funds secured through collective effort
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-2xl">✅</span>
                <div>
                  <p className="font-bold text-dynamic-pink">
                    Japan Trip Realized
                  </p>
                  <p className="text-dynamic-gray/70 text-sm">
                    The whole team goes together! 🇯🇵
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-center gap-2 rounded-lg bg-linear-to-r from-dynamic-pink/10 to-dynamic-rose/10 py-3">
              <span className="text-2xl">🎌</span>
              <p className="font-semibold text-dynamic-pink/80 italic">
                The team that worked hard and earned their dream trip together
              </p>
              <span className="text-2xl">🌸</span>
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
    <div className="group/slot flex flex-col items-center space-y-1 sm:space-y-2">
      <div className="relative rounded-lg border-2 border-dynamic-pink/30 bg-linear-to-br from-dynamic-pink/15 via-dynamic-rose/10 to-dynamic-red/15 px-2 py-1.5 shadow-lg transition-all duration-300 hover:scale-105 hover:border-dynamic-pink/50 hover:shadow-xl sm:rounded-xl sm:px-4 sm:py-3">
        <div className="absolute inset-0 rounded-lg bg-linear-to-br from-dynamic-pink/20 to-transparent opacity-0 transition-opacity duration-300 group-hover/slot:opacity-100 sm:rounded-xl"></div>
        <div className="relative font-black text-2xl text-dynamic-pink tabular-nums drop-shadow-md transition-all duration-200 sm:text-3xl md:text-4xl">
          {String(value).padStart(2, '0')}
        </div>
      </div>
      <div className="flex flex-col items-center gap-0.5 sm:gap-1">
        <p className="font-bold text-[10px] text-dynamic-pink/80 uppercase tracking-wider sm:text-xs sm:tracking-widest">
          {unit}
        </p>
        <p className="font-medium text-[10px] text-dynamic-pink/60 sm:text-xs">
          {kanji}
        </p>
      </div>
    </div>
  );

  return (
    <Card className="group relative mb-4 h-full overflow-hidden border-dynamic-pink/30 bg-linear-to-br from-dynamic-pink/5 via-dynamic-rose/10 to-dynamic-red/5 shadow-xl transition-all duration-300 hover:shadow-2xl">
      {/* Cherry blossom petals decoration */}
      <div className="pointer-events-none absolute inset-0 opacity-5">
        <div className="absolute top-0 right-0 h-full w-full">
          <div className="absolute top-4 right-4 h-24 w-24 animate-pulse rounded-full bg-dynamic-pink/40 blur-2xl"></div>
          <div
            className="absolute right-12 bottom-8 h-32 w-32 animate-pulse rounded-full bg-dynamic-rose/40 blur-2xl"
            style={{ animationDelay: '0.5s' }}
          ></div>
          <div
            className="absolute top-20 right-20 h-16 w-16 animate-pulse rounded-full bg-dynamic-pink/50 blur-xl"
            style={{ animationDelay: '1s' }}
          ></div>
        </div>
      </div>

      <CardHeader className="relative flex flex-row items-center space-y-0 border-dynamic-pink/30 border-b bg-linear-to-r from-dynamic-pink/10 via-dynamic-rose/10 to-dynamic-red/10 p-4 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-linear-to-br from-dynamic-pink/20 to-dynamic-rose/20 p-2 shadow-lg ring-2 ring-dynamic-pink/30">
            <Clock className="h-5 w-5 animate-pulse text-dynamic-pink drop-shadow-lg" />
          </div>
          <div className="flex flex-col">
            <CardTitle className="line-clamp-1 font-bold text-lg tracking-tight">
              Operation JT26 🌸 Japan Trip 2026
            </CardTitle>
            <span className="font-medium text-dynamic-pink/70 text-xs">
              日本への旅 (Journey to Japan)
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative h-full space-y-6 p-6">
        <div className="space-y-5">
          <div className="text-center">
            <div className="mb-4 flex justify-center gap-1.5 sm:mb-6 sm:gap-3">
              <TimeSlot value={timeLeft.days} unit="Days" kanji="日" />
              <div className="flex items-center font-black text-dynamic-pink/40 text-xl sm:text-2xl md:text-3xl">
                :
              </div>
              <TimeSlot value={timeLeft.hours} unit="Hours" kanji="時" />
              <div className="flex items-center font-black text-dynamic-pink/40 text-xl sm:text-2xl md:text-3xl">
                :
              </div>
              <TimeSlot value={timeLeft.minutes} unit="Minutes" kanji="分" />
              <div className="flex items-center font-black text-dynamic-pink/40 text-xl sm:text-2xl md:text-3xl">
                :
              </div>
              <TimeSlot value={timeLeft.seconds} unit="Seconds" kanji="秒" />
            </div>
          </div>

          <div className="space-y-3 rounded-xl border-2 border-dynamic-pink/20 bg-linear-to-br from-dynamic-pink/10 via-dynamic-rose/5 to-dynamic-red/10 p-3 shadow-lg backdrop-blur-sm sm:space-y-4 sm:p-5">
            <div className="flex flex-col gap-2 border-dynamic-pink/20 border-b pb-2 sm:flex-row sm:items-center sm:pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl sm:text-2xl">🎌</span>
                <h3 className="font-black text-dynamic-pink text-sm uppercase tracking-wide sm:text-base">
                  日本への旅
                </h3>
              </div>
              <span className="font-bold text-dynamic-pink/70 text-xs sm:ml-auto sm:text-sm">
                Mar 31, 2026
              </span>
            </div>
            <div className="space-y-2 text-sm sm:space-y-3">
              <div className="flex items-start gap-2 rounded-lg bg-dynamic-pink/5 p-2.5 transition-all duration-200 hover:bg-dynamic-pink/10 sm:gap-3 sm:p-3">
                <span className="text-lg sm:text-xl">💰</span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-dynamic-pink text-sm sm:text-base">
                    Ultimate Goal
                  </p>
                  <p className="text-dynamic-gray/80 text-xs sm:text-sm">
                    Make Tuturuuu profitable and sustainable
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-lg bg-dynamic-pink/5 p-2.5 transition-all duration-200 hover:bg-dynamic-pink/10 sm:gap-3 sm:p-3">
                <span className="text-lg sm:text-xl">👥</span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-dynamic-pink text-sm sm:text-base">
                    Mission
                  </p>
                  <p className="text-dynamic-gray/80 text-xs sm:text-sm">
                    Earn sufficient money for the whole team
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-lg bg-dynamic-pink/5 p-2.5 transition-all duration-200 hover:bg-dynamic-pink/10 sm:gap-3 sm:p-3">
                <span className="text-lg sm:text-xl">🗾</span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-dynamic-pink text-sm sm:text-base">
                    Dream
                  </p>
                  <p className="text-dynamic-gray/80 text-xs sm:text-sm">
                    Travel to Japan together in 2026 🇯🇵
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2 border-dynamic-pink/20 border-t pt-3 sm:pt-4">
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="text-base sm:text-lg">🌸</span>
                  <span className="font-bold text-dynamic-pink/90">
                    Journey Progress
                  </span>
                </div>
                <span className="font-black text-base text-dynamic-pink sm:text-lg">
                  {progress.toFixed(1)}%
                </span>
              </div>
              <div className="relative h-2.5 overflow-hidden rounded-full bg-dynamic-gray/10 shadow-inner sm:h-3">
                <div
                  className="h-full bg-linear-to-r from-dynamic-pink via-dynamic-rose to-dynamic-red shadow-lg transition-all duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
                <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/20 to-transparent"></div>
              </div>
              <p className="flex items-start gap-1 text-[11px] text-dynamic-pink/70 sm:items-center sm:gap-1.5 sm:text-xs">
                <span className="shrink-0">🌸</span>
                <span>
                  {progress < 100
                    ? `${Math.ceil(((100 - progress) / 100) * ((new Date('2026-03-31T16:59:00Z').getTime() - new Date('2025-11-07T00:00:00Z').getTime()) / (1000 * 60 * 60 * 24)))} days until our Japan adventure`
                    : 'Time to go to Japan! 🎌'}
                </span>
              </p>
            </div>

            <div className="rounded-lg bg-linear-to-r from-dynamic-pink/10 to-dynamic-rose/10 p-2.5 sm:p-3">
              <p className="text-center font-bold text-dynamic-pink text-xs sm:text-sm">
                Working hard today for an unforgettable journey tomorrow.
                頑張って！ 🌸
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
      <CountdownDD />
      <CountdownJT26 />
    </>
  );
};

export default Countdown;
