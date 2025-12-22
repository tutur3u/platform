'use client';

import type { SchedulingWeights } from '@tuturuuu/ai/scheduling';
import {
  scoreSlotForHabit,
  scoreSlotForTask,
} from '@tuturuuu/ai/scheduling/duration-optimizer';
import dayjs from 'dayjs';
import { useMemo } from 'react';
import type { CalendarScenario } from '../types';

export const HeatmapOverlay = ({
  scenario,
  selectedItemId,
  dates,
  weights,
}: {
  scenario: CalendarScenario;
  selectedItemId: string;
  dates: Date[];
  weights?: SchedulingWeights;
}) => {
  const item =
    scenario.habits.find((h) => h.id === selectedItemId) ||
    scenario.tasks.find((t) => t.id === selectedItemId);

  const timezone = scenario.settings.timezone;
  const isHabit = item && 'duration_minutes' in item;

  const scores = useMemo(() => {
    if (!item) return [];

    return dates.map((date) => {
      const dayScores = [];
      for (let i = 0; i < 24 * 4; i++) {
        const hour = Math.floor(i / 4);
        const minute = (i % 4) * 15;
        const slotStart = dayjs(date).hour(hour).minute(minute).toDate();
        const slotEnd = dayjs(slotStart).add(15, 'minute').toDate();
        const slot = { start: slotStart, end: slotEnd, maxAvailable: 15 };

        let score = 0;
        if (isHabit) {
          score = scoreSlotForHabit(item as any, slot, timezone, weights);
        } else {
          score = scoreSlotForTask(
            item as any,
            slot,
            new Date(),
            timezone,
            weights
          );
        }
        dayScores.push(score);
      }
      return dayScores;
    });
  }, [item, dates, timezone, weights, isHabit]);

  if (!item) return null;

  return (
    <div className="absolute inset-0 flex">
      {dates.map((_, dateIdx) => (
        <div key={dateIdx} className="flex flex-1 flex-col">
          {scores[dateIdx]?.map((score, i) => {
            const normalized = Math.max(0, Math.min(1, score / 1500));
            return (
              <div
                key={i}
                className="h-[20px] w-full"
                style={{
                  backgroundColor:
                    normalized > 0
                      ? `rgba(34, 197, 94, ${normalized * 0.5})`
                      : 'transparent',
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
};
