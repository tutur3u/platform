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
      <Card className="mb-4 overflow-hidden border-dynamic-cyan/20 transition-all duration-300">
        <CardHeader className="flex flex-row items-center space-y-0 border-dynamic-cyan/20 border-b bg-linear-to-r from-dynamic-cyan/5 to-dynamic-blue/5 p-4">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-dynamic-cyan/10 p-1.5 text-dynamic-cyan">
              <Clock className="h-4 w-4" />
            </div>
            <CardTitle className="line-clamp-1 font-semibold text-base">
              Operation DD Complete! ⛵
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="h-full space-y-6 p-6">
          <div className="space-y-4">
            <p className="font-semibold text-dynamic-cyan">
              SPARK Hub Demo Day - We've Set Sail! 🌊
            </p>
            <div className="space-y-2 rounded-lg bg-dynamic-cyan/5 p-4">
              <p className="text-dynamic-gray/80 text-sm">
                ✅ <strong>MVP product delivered</strong> - Tudo fully completed
              </p>
              <p className="text-dynamic-gray/80 text-sm">
                ✅ <strong>Pitch Deck refined</strong> - Ready for presentation
              </p>
              <p className="text-dynamic-gray/80 text-sm">
                ✅ <strong>Demo delivered</strong> - Product showcased
                successfully
              </p>
            </div>
            <p className="text-dynamic-gray/60 text-sm italic">
              Tuturuuu has sailed into the big sea! �
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const TimeSlot = ({ value, unit }: { value: number; unit: string }) => (
    <div className="flex flex-col items-center space-y-2">
      <div className="rounded-lg border border-dynamic-cyan/20 bg-dynamic-cyan/10 px-3 py-2 transition-all duration-200 hover:border-dynamic-cyan/30 hover:bg-dynamic-cyan/15">
        <div className="font-bold text-3xl text-dynamic-cyan tabular-nums transition-all duration-200">
          {String(value).padStart(2, '0')}
        </div>
      </div>
      <p className="font-semibold text-dynamic-gray/70 text-xs uppercase tracking-wider">
        {unit}
      </p>
    </div>
  );

  return (
    <Card className="mb-4 overflow-hidden border-dynamic-cyan/20 shadow-lg transition-all duration-300">
      <CardHeader className="flex flex-row items-center space-y-0 border-dynamic-cyan/20 border-b bg-linear-to-r from-dynamic-cyan/5 to-dynamic-blue/5 p-4">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-dynamic-cyan/10 p-1.5 text-dynamic-cyan">
            <Clock className="h-4 w-4 animate-pulse" />
          </div>
          <CardTitle className="line-clamp-1 font-semibold text-base">
            Operation DD ⛵ Sailing to the Big Sea
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="h-full space-y-6 p-6">
        <div className="space-y-4">
          <div className="text-center">
            <div className="mb-4 flex justify-center gap-4">
              <TimeSlot value={timeLeft.days} unit="Days" />
              <div className="flex items-center font-bold text-2xl text-dynamic-gray/60">
                :
              </div>
              <TimeSlot value={timeLeft.hours} unit="Hours" />
              <div className="flex items-center font-bold text-2xl text-dynamic-gray/60">
                :
              </div>
              <TimeSlot value={timeLeft.minutes} unit="Minutes" />
              <div className="flex items-center font-bold text-2xl text-dynamic-gray/60">
                :
              </div>
              <TimeSlot value={timeLeft.seconds} unit="Seconds" />
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-dynamic-cyan/10 bg-linear-to-r from-dynamic-cyan/5 to-dynamic-blue/5 p-4">
            <h3 className="font-bold text-dynamic-cyan text-sm uppercase tracking-wide">
              📢 SPARK Hub Demo Day - December 4, 2025
            </h3>
            <div className="space-y-2 text-sm">
              <p className="text-dynamic-gray/80">
                <strong>Set Sail:</strong> Fully complete our deliverable MVP
                product (Tudo)
              </p>
              <p className="text-dynamic-gray/80">
                <strong>Navigate:</strong> Refine our Pitch Deck for maximum
                impact
              </p>
              <p className="text-dynamic-gray/80">
                <strong>Chart Course:</strong> Give a compelling demo showcasing
                our products
              </p>
            </div>

            <div className="space-y-2 pt-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-dynamic-gray/70">
                  Voyage Progress
                </span>
                <span className="font-bold text-dynamic-cyan">
                  {progress.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-dynamic-gray/10">
                <div
                  className="h-full bg-linear-to-r from-dynamic-cyan to-dynamic-blue transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-dynamic-gray/60 text-xs">
                {progress < 100
                  ? `${Math.ceil(((100 - progress) / 100) * ((new Date('2025-12-04T16:59:00Z').getTime() - new Date('2025-11-07T00:00:00Z').getTime()) / (1000 * 60 * 60 * 24)))} days until we sail to the big sea`
                  : 'Time to set sail! 🌊'}
              </p>
            </div>

            <div className="border-dynamic-cyan/10 border-t pt-2">
              <p className="font-medium text-dynamic-cyan/80 text-xs">
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
      <Card className="mb-4 overflow-hidden border-dynamic-pink/20 transition-all duration-300">
        <CardHeader className="flex flex-row items-center space-y-0 border-dynamic-pink/20 border-b bg-linear-to-r from-dynamic-pink/5 to-dynamic-rose/5 p-4">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-dynamic-pink/10 p-1.5 text-dynamic-pink">
              <Clock className="h-4 w-4" />
            </div>
            <CardTitle className="line-clamp-1 font-semibold text-base">
              Operation JT26 Complete! 🌸
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="h-full space-y-6 p-6">
          <div className="space-y-4">
            <p className="font-semibold text-dynamic-pink">
              日本への旅 - Journey to Japan Achieved!
            </p>
            <div className="space-y-2 rounded-lg bg-dynamic-pink/5 p-4">
              <p className="text-dynamic-gray/80 text-sm">
                ✅ <strong>Profitability achieved</strong> - Tuturuuu is
                sustainable
              </p>
              <p className="text-dynamic-gray/80 text-sm">
                ✅ <strong>Team earned together</strong> - Sufficient funds
                secured
              </p>
              <p className="text-dynamic-gray/80 text-sm">
                ✅ <strong>Japan trip realized</strong> - The whole team goes
                together! 🇯🇵
              </p>
            </div>
            <p className="text-dynamic-gray/60 text-sm italic">
              The team that worked hard and earned their dream trip together. 🎌
            </p>
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
    <div className="flex flex-col items-center space-y-2">
      <div className="rounded-lg border border-dynamic-pink/20 bg-dynamic-pink/10 px-3 py-2 transition-all duration-200 hover:border-dynamic-pink/30 hover:bg-dynamic-pink/15">
        <div className="font-bold text-3xl text-dynamic-pink tabular-nums transition-all duration-200">
          {String(value).padStart(2, '0')}
        </div>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <p className="font-semibold text-dynamic-gray/70 text-xs uppercase tracking-wider">
          {unit}
        </p>
        <p className="text-dynamic-pink/60 text-xs">{kanji}</p>
      </div>
    </div>
  );

  return (
    <Card className="mb-4 overflow-hidden border-dynamic-pink/20 shadow-lg transition-all duration-300">
      <CardHeader className="flex flex-row items-center space-y-0 border-dynamic-pink/20 border-b bg-linear-to-r from-dynamic-pink/5 to-dynamic-rose/5 p-4">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-dynamic-pink/10 p-1.5 text-dynamic-pink">
            <Clock className="h-4 w-4 animate-pulse" />
          </div>
          <CardTitle className="line-clamp-1 font-semibold text-base">
            Operation JT26 🌸 Japan Trip 2026
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="h-full space-y-6 p-6">
        <div className="space-y-4">
          <div className="text-center">
            <div className="mb-4 flex justify-center gap-4">
              <TimeSlot value={timeLeft.days} unit="Days" kanji="日" />
              <div className="flex items-center font-bold text-2xl text-dynamic-gray/60">
                :
              </div>
              <TimeSlot value={timeLeft.hours} unit="Hours" kanji="時" />
              <div className="flex items-center font-bold text-2xl text-dynamic-gray/60">
                :
              </div>
              <TimeSlot value={timeLeft.minutes} unit="Minutes" kanji="分" />
              <div className="flex items-center font-bold text-2xl text-dynamic-gray/60">
                :
              </div>
              <TimeSlot value={timeLeft.seconds} unit="Seconds" kanji="秒" />
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-dynamic-pink/10 bg-linear-to-r from-dynamic-pink/5 to-dynamic-rose/5 p-4">
            <h3 className="font-bold text-dynamic-pink text-sm uppercase tracking-wide">
              🎌 日本への旅 - Journey to Japan
            </h3>
            <div className="space-y-2 text-sm">
              <p className="text-dynamic-gray/80">
                <strong>Ultimate Goal:</strong> Make Tuturuuu profitable
              </p>
              <p className="text-dynamic-gray/80">
                <strong>Mission:</strong> Earn sufficient money for the whole
                team
              </p>
              <p className="text-dynamic-gray/80">
                <strong>Dream:</strong> Travel to Japan together in 2026 🇯🇵
              </p>
            </div>

            <div className="space-y-2 pt-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-dynamic-gray/70">
                  Journey Progress
                </span>
                <span className="font-bold text-dynamic-pink">
                  {progress.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-dynamic-gray/10">
                <div
                  className="h-full bg-linear-to-r from-dynamic-pink to-dynamic-rose transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-dynamic-gray/60 text-xs">
                {progress < 100
                  ? `${Math.ceil(((100 - progress) / 100) * ((new Date('2026-03-31T16:59:00Z').getTime() - new Date('2025-11-07T00:00:00Z').getTime()) / (1000 * 60 * 60 * 24)))} days until our Japan adventure`
                  : 'Time to go to Japan! 🎌'}
              </p>
            </div>

            <div className="border-dynamic-pink/10 border-t pt-2">
              <p className="font-medium text-dynamic-pink/80 text-xs">
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
