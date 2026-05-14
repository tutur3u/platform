'use client';

import { useState } from 'react';
import type { HiveCameraView, HiveSeason, HiveWeather } from '@/engine/types';
import { useHiveTimeOfDay } from './use-hive-time-of-day';

export function useHiveEnvironmentControls() {
  const [cameraView, setCameraView] = useState<HiveCameraView>('isometric');
  const [gaplessMode, setGaplessMode] = useState(false);
  const [season, setSeason] = useState<HiveSeason>('spring');
  const [weather, setWeather] = useState<HiveWeather>('clear');
  const timeOfDay = useHiveTimeOfDay();

  return {
    autoTimeEnabled: timeOfDay.autoTimeEnabled,
    autoTimeSpeed: timeOfDay.autoTimeSpeed,
    cameraView,
    gaplessMode,
    season,
    setAutoTimeEnabled: timeOfDay.setAutoTimeEnabled,
    setAutoTimeSpeed: timeOfDay.setAutoTimeSpeed,
    setCameraView,
    setClockMinutes: timeOfDay.setClockMinutes,
    setGaplessMode,
    setSeason,
    setWeather,
    simulatedMinutes: timeOfDay.simulatedMinutes,
    timeTheme: timeOfDay.timeTheme,
    weather,
  };
}
