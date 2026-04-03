'use client';

import { Card, CardContent } from '@ncthub/ui/card';
import { useEffect, useState } from 'react';

const OPENING_CEREMONY_TIMESTAMP = new Date('2026-04-04T10:00:00+07:00');

type TimeUnit = {
  label: 'Days' | 'Hours' | 'Minutes' | 'Seconds';
  value: string;
};

function getTimeLeft(): TimeUnit[] {
  const remainingTime = Math.max(
    0,
    OPENING_CEREMONY_TIMESTAMP.getTime() - Date.now()
  );
  const totalSeconds = Math.floor(remainingTime / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [
    { label: 'Days', value: String(days).padStart(2, '0') },
    { label: 'Hours', value: String(hours).padStart(2, '0') },
    { label: 'Minutes', value: String(minutes).padStart(2, '0') },
    { label: 'Seconds', value: String(seconds).padStart(2, '0') },
  ];
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

export default function CountdownTimer() {
  const [timeUnits, setTimeUnits] = useState<TimeUnit[]>(() => getTimeLeft());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTimeUnits(getTimeLeft());
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
                Our opening ceremony will start in:
              </p>

              <div className="btn-primary self-start rounded-full border border-border/70 py-2! font-medium text-xs sm:text-sm">
                {OPENING_CEREMONY_TIMESTAMP.toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZoneName: 'short',
                })}
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
