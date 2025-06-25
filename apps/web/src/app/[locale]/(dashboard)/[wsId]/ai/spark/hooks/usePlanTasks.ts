'use client';

import { useMemo } from 'react';
import type { YearPlan } from '../types';

export function usePlanTasks(yearPlan: YearPlan | undefined) {
  const allTasks = useMemo(() => {
    if (!yearPlan?.quarters) return [];

    return yearPlan.quarters.flatMap((quarter) =>
      (quarter.milestones ?? []).flatMap((milestone) =>
        (milestone.tasks ?? []).map((task) => ({
          ...task,
          milestone: milestone.title,
        }))
      )
    );
  }, [yearPlan]);

  return {
    allTasks,
  };
}
