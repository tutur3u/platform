'use client';

import { useEffect, useMemo } from 'react';

let sequence = 0;

/** Performance entries contain fixed stage names and timings only. */
export function useMiraLatency() {
  const timing = useMemo(() => {
    let prefix: string | null = null;
    const stages = new Set<string>();
    const clear = () => {
      for (const stage of stages) performance.clearMarks(`${prefix}:${stage}`);
      stages.clear();
      prefix = null;
    };
    const stage = (name: string) => {
      if (!prefix || stages.has(name)) return;
      performance.mark(`${prefix}:${name}`);
      performance.measure(
        `mira:submit-to-${name}`,
        `${prefix}:submit`,
        `${prefix}:${name}`
      );
      stages.add(name);
    };
    return {
      begin: () => {
        clear();
        prefix = `mira-turn-${++sequence}`;
        performance.mark(`${prefix}:submit`);
        stages.add('submit');
      },
      activityVisible: () => stage('activity-visible'),
      requestStart: () => stage('request-start'),
      firstText: () => stage('first-text'),
      finish: () => {
        stage('finish');
        clear();
      },
      cancel: clear,
    };
  }, []);

  useEffect(() => () => timing.cancel(), [timing]);
  return timing;
}
