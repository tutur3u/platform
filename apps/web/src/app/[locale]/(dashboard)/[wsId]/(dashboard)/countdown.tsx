'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Clock } from 'lucide-react';
import { useEffect, useState } from 'react';

const Countdown = () => {
  const calculateTimeLeft = () => {
    const milestoneDate = new Date('2025-11-06T17:00:00Z');
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
    const milestoneDate = new Date('2025-11-06T17:00:00Z');
    const startDate = new Date(
      milestoneDate.getTime() - 60 * 24 * 60 * 60 * 1000
    ); // 60 days before milestone
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
      <Card className="mb-4 overflow-hidden border-dynamic-green/20 transition-all duration-300">
        <CardHeader className="flex flex-row items-center space-y-0 border-dynamic-green/20 border-b bg-gradient-to-r from-dynamic-green/5 to-dynamic-emerald/5 p-4">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-dynamic-green/10 p-1.5 text-dynamic-green">
              <Clock className="h-4 w-4" />
            </div>
            <CardTitle className="line-clamp-1 font-semibold text-base">
              Operation: xM Complete! 🚀
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="h-full space-y-6 p-6">
          <div className="space-y-4">
            <p className="font-semibold text-dynamic-green">
              Mission Accomplished! Tuturuuu has been revolutionized.
            </p>
            <div className="space-y-2 rounded-lg bg-dynamic-green/5 p-4">
              <p className="text-dynamic-gray/80 text-sm">
                ✅ <strong>Customer validation complete</strong> - Problem
                identified
              </p>
              <p className="text-dynamic-gray/80 text-sm">
                ✅ <strong>Sustainable solution built</strong> - Foundation for
                growth established
              </p>
              <p className="text-dynamic-gray/80 text-sm">
                ✅ <strong>Company transformed</strong> - From the brink to
                resilient business
              </p>
            </div>
            <p className="text-dynamic-gray/60 text-sm italic">
              The founding team that built a real, resilient company from the
              brink. 🏆
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const TimeSlot = ({ value, unit }: { value: number; unit: string }) => (
    <div className="flex flex-col items-center space-y-2">
      <div className="rounded-lg border border-dynamic-red/20 bg-dynamic-red/10 px-3 py-2 transition-all duration-200 hover:border-dynamic-red/30 hover:bg-dynamic-red/15">
        <div className="font-bold text-3xl text-dynamic-red tabular-nums transition-all duration-200">
          {String(value).padStart(2, '0')}
        </div>
      </div>
      <p className="font-semibold text-dynamic-gray/70 text-xs uppercase tracking-wider">
        {unit}
      </p>
    </div>
  );

  return (
    <Card className="mb-4 overflow-hidden border-dynamic-red/20 shadow-lg transition-all duration-300">
      <CardHeader className="flex flex-row items-center space-y-0 border-dynamic-red/20 border-b bg-gradient-to-r from-dynamic-red/5 to-dynamic-orange/5 p-4">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-dynamic-red/10 p-1.5 text-dynamic-red">
            <Clock className="h-4 w-4 animate-pulse" />
          </div>
          <CardTitle className="line-clamp-1 font-semibold text-base">
            Operation: xM ⚡ Mission Critical
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

          <div className="space-y-3 rounded-lg bg-gradient-to-r from-dynamic-red/5 to-dynamic-orange/5 p-4">
            <h3 className="font-bold text-dynamic-red text-sm uppercase tracking-wide">
              🎯 60-Day Make or Break Mission
            </h3>
            <div className="space-y-2 text-sm">
              <p className="text-dynamic-gray/80">
                <strong>Goal:</strong> Identify painful problem & build
                sustainable solution
              </p>
              <p className="text-dynamic-gray/80">
                <strong>Stakes:</strong> Transform Tuturuuu from the brink to
                resilient company
              </p>
              <p className="text-dynamic-gray/80">
                <strong>Team:</strong> Elite core group driving customer
                validation & development
              </p>
            </div>

            <div className="space-y-2 pt-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-dynamic-gray/70">
                  Mission Progress
                </span>
                <span className="font-bold text-dynamic-red">
                  {progress.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-dynamic-gray/10">
                <div
                  className="h-full bg-gradient-to-r from-dynamic-red to-dynamic-orange transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-dynamic-gray/60 text-xs">
                {progress < 100
                  ? `${(60 - (progress / 100) * 60).toFixed(0)} days remaining`
                  : 'Mission timeline complete'}
              </p>
            </div>

            <div className="border-dynamic-red/10 border-t pt-2">
              <p className="font-medium text-dynamic-red/80 text-xs">
                Success means our names written as the founding team that built
                something real. 🚀
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default Countdown;
