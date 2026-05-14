'use client';

import {
  hiveCameraViewOrder,
  hiveSeasonOrder,
  hiveWeatherOrder,
} from '@/engine/environment';
import type { HiveCameraView, HiveSeason, HiveWeather } from '@/engine/types';
import { isBoolean, useHivePersistedState } from './use-hive-persisted-state';
import { useHiveTimeOfDay } from './use-hive-time-of-day';

function isHiveCameraView(value: unknown): value is HiveCameraView {
  return (
    typeof value === 'string' &&
    hiveCameraViewOrder.includes(value as HiveCameraView)
  );
}

function isHiveSeason(value: unknown): value is HiveSeason {
  return (
    typeof value === 'string' && hiveSeasonOrder.includes(value as HiveSeason)
  );
}

function isHiveWeather(value: unknown): value is HiveWeather {
  return (
    typeof value === 'string' && hiveWeatherOrder.includes(value as HiveWeather)
  );
}

export function useHiveEnvironmentControls() {
  const [cameraView, setCameraView] = useHivePersistedState<HiveCameraView>(
    'hive.editor.cameraView',
    'isometric',
    { validate: isHiveCameraView }
  );
  const [gaplessMode, setGaplessMode] = useHivePersistedState(
    'hive.editor.gaplessMode',
    false,
    { validate: isBoolean }
  );
  const [season, setSeason] = useHivePersistedState<HiveSeason>(
    'hive.editor.season',
    'spring',
    { validate: isHiveSeason }
  );
  const [weather, setWeather] = useHivePersistedState<HiveWeather>(
    'hive.editor.weather',
    'clear',
    { validate: isHiveWeather }
  );
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
