'use client';

import { Card, CardContent } from '@ncthub/ui/card';
import { useEffect, useState } from 'react';
import { getTimeLeft, type TimeUnit } from '@/utils/time-helper';

const importantDates: ImportantDate[] = [
  {
    announcement: 'Our opening ceremony will start in:',
    timeLabel: '04-04-2026 10:00:00 GMT+7',
    timestamp: new Date('2026-04-04T10:00:00+07:00'),
  },
  {
    announcement: 'Remaining time to Round 1 deadline:',
    timeLabel: '17-04-2026 23:59:59 GMT+7',
    timestamp: new Date('2026-04-17T23:59:59+07:00'),
  },
  {
    announcement: 'Round 2 will start in:',
    timeLabel: '24-04-2026 00:00:00 GMT+7',
    timestamp: new Date('2026-04-24T00:00:00+07:00'),
  },
  {
    announcement: 'Remaining time to Round 2 deadline:',
    timeLabel: '16-05-2026 00:00:00 GMT+7',
    timestamp: new Date('2026-05-16T00:00:00+07:00'),
  },
  {
    announcement: 'The Top 5 teams will be announced in:',
    timeLabel: '23-05-2026 00:00:00 GMT+7',
    timestamp: new Date('2026-05-23T00:00:00+07:00'),
  },
  {
    announcement: 'Our Final Day will start in:',
    timeLabel: '29-05-2026 00:00:00 GMT+7',
    timestamp: new Date('2026-05-29T00:00:00+07:00'),
  },
];

interface ImportantDate {
  announcement: string;
  timeLabel: string;
  timestamp: Date;
}

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

function getNextImportantDate(from: Date) {
  for (const importantDate of importantDates) {
    if (importantDate.timestamp >= from) return importantDate;
  }

  return null;
}

export default function CountdownTimer() {
  const [resolvedDate, setResolvedDate] = useState<ImportantDate | null>(null);
  const displayDate =
    resolvedDate ?? importantDates[importantDates.length - 1]!;

  const [timeUnits, setTimeUnits] = useState<TimeUnit[]>([
    { label: 'Days', value: '00' },
    { label: 'Hours', value: '00' },
    { label: 'Minutes', value: '00' },
    { label: 'Seconds', value: '00' },
  ]);

  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const nextImportantDate = getNextImportantDate(now);

      if (!nextImportantDate) return;

      setResolvedDate(nextImportantDate);
      setTimeUnits(getTimeLeft(now, nextImportantDate.timestamp));
    };

    updateCountdown();

    const interval = window.setInterval(() => {
      updateCountdown();
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

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
                {displayDate.announcement}
              </p>

              <div className="btn-primary self-start rounded-full border border-border/70 py-2! font-medium text-xs sm:text-sm">
                {displayDate.timeLabel}
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
