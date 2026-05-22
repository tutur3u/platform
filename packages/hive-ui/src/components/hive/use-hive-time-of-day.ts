'use client';

import { useEffect, useState } from 'react';
import {
  getDefaultMinutesForTheme,
  getTimeThemeForMinutes,
} from '../../engine/time-themes';
import type { HiveTimeTheme } from '../../engine/types';
import {
  isBoolean,
  isFiniteNumber,
  useHivePersistedState,
} from './use-hive-persisted-state';

function isPersistedSpeed(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 1 && value <= 60;
}

function isPersistedMinutes(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value < 1440;
}

export function useHiveTimeOfDay() {
  const [timeTheme, setTimeTheme] = useState<HiveTimeTheme>('morning');
  const [autoTimeEnabled, setAutoTimeEnabled] = useHivePersistedState(
    'hive.editor.autoTimeEnabled',
    false,
    { validate: isBoolean }
  );
  const [autoTimeSpeed, setAutoTimeSpeed] = useHivePersistedState(
    'hive.editor.autoTimeSpeed',
    10,
    { validate: isPersistedSpeed }
  );
  const [simulatedMinutes, setSimulatedMinutes] = useHivePersistedState(
    'hive.editor.simulatedMinutes',
    8 * 60,
    { validate: isPersistedMinutes }
  );

  useEffect(() => {
    if (!autoTimeEnabled) return;
    const id = window.setInterval(() => {
      setSimulatedMinutes((minutes) => (minutes + autoTimeSpeed) % 1440);
    }, 1000);

    return () => window.clearInterval(id);
  }, [autoTimeEnabled, autoTimeSpeed, setSimulatedMinutes]);

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
