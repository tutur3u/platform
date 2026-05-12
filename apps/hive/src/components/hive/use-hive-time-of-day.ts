'use client';

import { useEffect, useState } from 'react';
import {
  getDefaultMinutesForTheme,
  getTimeThemeForMinutes,
} from '@/engine/time-themes';
import type { HiveTimeTheme } from '@/engine/types';

export function useHiveTimeOfDay() {
  const [timeTheme, setTimeTheme] = useState<HiveTimeTheme>('morning');
  const [autoTimeEnabled, setAutoTimeEnabled] = useState(false);
  const [autoTimeSpeed, setAutoTimeSpeed] = useState(10);
  const [simulatedMinutes, setSimulatedMinutes] = useState(8 * 60);

  useEffect(() => {
    if (!autoTimeEnabled) return;
    const id = window.setInterval(() => {
      setSimulatedMinutes((minutes) => (minutes + autoTimeSpeed) % 1440);
    }, 1000);

    return () => window.clearInterval(id);
  }, [autoTimeEnabled, autoTimeSpeed]);

  useEffect(() => {
    if (!autoTimeEnabled) return;
    setTimeTheme(getTimeThemeForMinutes(simulatedMinutes));
  }, [autoTimeEnabled, simulatedMinutes]);

  const selectTimeTheme = (theme: HiveTimeTheme) => {
    setAutoTimeEnabled(false);
    setSimulatedMinutes(getDefaultMinutesForTheme(theme));
    setTimeTheme(theme);
  };

  return {
    autoTimeEnabled,
    autoTimeSpeed,
    setAutoTimeEnabled,
    setAutoTimeSpeed,
    setTimeTheme: selectTimeTheme,
    simulatedMinutes,
    timeTheme,
  };
}
