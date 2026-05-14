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
    setTimeTheme(getTimeThemeForMinutes(simulatedMinutes));
  }, [simulatedMinutes]);

  const selectTimeTheme = (theme: HiveTimeTheme) => {
    setAutoTimeEnabled(false);
    setSimulatedMinutes(getDefaultMinutesForTheme(theme));
    setTimeTheme(theme);
  };

  const setClockMinutes = (minutes: number) => {
    setAutoTimeEnabled(false);
    setSimulatedMinutes(((Math.round(minutes) % 1440) + 1440) % 1440);
  };

  return {
    autoTimeEnabled,
    autoTimeSpeed,
    setAutoTimeEnabled,
    setAutoTimeSpeed,
    setClockMinutes,
    setTimeTheme: selectTimeTheme,
    simulatedMinutes,
    timeTheme,
  };
}
