'use client';

import {
  scoreSlotForHabit,
  scoreSlotForTask,
} from '@tuturuuu/ai/scheduling/duration-optimizer';
import dayjs from 'dayjs';
import type { CalendarScenario } from '../types';

export const HeatmapOverlay = ({
  scenario,
  selectedItemId,
  dates,
}: {
  scenario: CalendarScenario;
  selectedItemId: string;
  dates: Date[];
}) => {
  const item =
    scenario.habits.find((h) => h.id === selectedItemId) ||
    scenario.tasks.find((t) => t.id === selectedItemId);

  if (!item) return null;

  const timezone = scenario.settings.timezone;
  const isHabit = 'duration_minutes' in item;

  const renderSlot = (date: Date, hour: number, minute: number) => {
    const slotStart = dayjs(date).hour(hour).minute(minute).toDate();
    const slotEnd = dayjs(slotStart).add(15, 'minute').toDate();
    const slot = { start: slotStart, end: slotEnd, maxAvailable: 15 };

    let score = 0;
    if (isHabit) {
      score = scoreSlotForHabit(item as any, slot, timezone);
    } else {
      score = scoreSlotForTask(item as any, slot, new Date(), timezone);
    }

    // Normalize score for color (0 to 1)
    // scoreSlotForHabit can go up to 1500+
    // scoreSlotForTask can go up to 1000+
    const normalized = Math.max(0, Math.min(1, score / 1500));

    return (
      <div
        key={`${hour}-${minute}`}
        className="h-[20px] w-full" // 80px / 4
        style={{
          backgroundColor:
            normalized > 0 ? `rgba(34, 197, 94, ${normalized * 0.5})` : 'transparent',
        }}
      />
    );
  };

  return (
    <div className="absolute inset-0 flex">
      {dates.map((date, idx) => (
        <div key={idx} className="flex flex-1 flex-col">
          {Array.from({ length: 24 * 4 }).map((_, i) => {
            const hour = Math.floor(i / 4);
            const minute = (i % 4) * 15;
            return renderSlot(date, hour, minute);
          })}
        </div>
      ))}
    </div>
  );
};
