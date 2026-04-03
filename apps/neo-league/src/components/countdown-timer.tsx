'use client';

import { Card, CardContent } from '@ncthub/ui/card';
import { useEffect, useMemo, useState } from 'react';
import { getTimeLeft, type TimeUnit } from '@/utils/time-helper';

const importantDates = [
  {
    announcement: 'Our opening ceremony will start in:',
    timeLabel: '04-04-2026 10:00:00 GMT+7',
    timestamp: new Date('2026-04-04T10:00:00+07:00'),
  },
  {
    announcement: 'Remaining time to Round 1 deadline:',
    timeLabel: '17-04-2026 00:00:00 GMT+7',
    timestamp: new Date('2026-17-04T00:00:00+07:00'),
  },
  {
    announcement: 'Round 2 will start in:',
    timeLabel: '24-04-2026 00:00:00 GMT+7',
    timestamp: new Date('2026-24-04T00:00:00+07:00'),
  },
  {
    announcement: 'Remaining time to Round 2 deadline:',
    timeLabel: '07-05-2026 00:00:00 GMT+7',
    timestamp: new Date('2026-16-05T00:00:00+07:00'),
  },
  {
    announcement: 'The Top 5 teams will be announced in:',
    timeLabel: '23-05-2026 00:00:00 GMT+7',
    timestamp: new Date('2026-23-05T00:00:00+07:00'),
  },
  {
    announcement: 'Our Final Day will start in:',
    timeLabel: '29-05-2026 00:00:00 GMT+7',
    timestamp: new Date('2026-29-05T00:00:00+07:00'),
  },
];

function CountdownUnit({ label, value }: TimeUnit) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 text-center">
      <span className="font-black text-5xl text-primary md:text-7xl">
        {value}
      </span>
      <span className="font-medium text-muted-foreground text-sm uppercase tracking-[0.22em] sm:text-base">
        {label}
      </span>
    </div>
  );
}

export default function CountdownTimer() {
  const resolvedDate = useMemo(() => {
    const now = new Date();

    for (const importantDate of importantDates) {
      if (importantDate.timestamp > now) return importantDate;
    }

    return importantDates[0];
  }, []);

  const [timeUnits, setTimeUnits] = useState<TimeUnit[]>(() =>
    getTimeLeft(new Date(), resolvedDate ? resolvedDate.timestamp : new Date())
  );

  useEffect(() => {
    if (!resolvedDate) return;

    setTimeUnits(getTimeLeft(new Date(), resolvedDate.timestamp));

    const interval = window.setInterval(() => {
      setTimeUnits(getTimeLeft(new Date(), resolvedDate.timestamp));
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [resolvedDate]);

  if (!resolvedDate) return null;

  return (
    <div
      className="w-full max-w-5xl animate-slide-up"
      style={{ animationDelay: '0.2s' }}
    >
      <Card className="glass-card relative overflow-hidden">
        <CardContent className="p-6 sm:p-8 md:p-10">
          <div className="flex flex-col gap-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-semibold text-muted-foreground text-sm uppercase tracking-[0.24em] sm:text-base">
                {resolvedDate.announcement}
              </p>

              <div className="btn-primary self-start rounded-full border border-border/70 py-2! font-medium text-xs sm:text-sm">
                {resolvedDate.timeLabel}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:hidden">
              {timeUnits.map((unit, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-border/70 bg-background/35 px-4 py-5"
                >
                  <CountdownUnit {...unit} />
                </div>
              ))}
            </div>

            <div className="hidden items-stretch justify-between gap-6 md:flex">
              {timeUnits.map((unit, index) => (
                <div key={index} className="contents">
                  <CountdownUnit {...unit} />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
