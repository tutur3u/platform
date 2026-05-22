import type { HiveTimeTheme } from './types';

export const timeThemeLabels: Record<HiveTimeTheme, string> = {
  afternoon: 'Afternoon',
  evening: 'Evening',
  midnight: 'Midnight',
  morning: 'Morning',
  noon: 'Noon',
};

export const timeThemeOrder: HiveTimeTheme[] = [
  'morning',
  'noon',
  'afternoon',
  'evening',
  'midnight',
];

export function getTimeThemeForMinutes(minutes: number): HiveTimeTheme {
  const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;

  if (normalized < 300) return 'midnight';
  if (normalized < 660) return 'morning';
  if (normalized < 840) return 'noon';
  if (normalized < 1080) return 'afternoon';
  if (normalized < 1260) return 'evening';
  return 'midnight';
}

export function getDefaultMinutesForTheme(theme: HiveTimeTheme) {
  if (theme === 'morning') return 8 * 60;
  if (theme === 'noon') return 12 * 60;
  if (theme === 'afternoon') return 16 * 60;
  if (theme === 'evening') return 19 * 60;
  return 0;
}

export function formatSimulatedClock(minutes: number) {
  const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60)
    .toString()
    .padStart(2, '0');
  const mins = (normalized % 60).toString().padStart(2, '0');

  return `${hours}:${mins}`;
}

export const timeThemePresets: Record<
  HiveTimeTheme,
  {
    ambientIntensity: number;
    background: string;
    directionalIntensity: number;
    fogFar: number;
    fogNear: number;
    shadowOpacity: number;
    skyInclination: number;
    sunPosition: [number, number, number];
    tint: string;
    cloud: string;
  }
> = {
  afternoon: {
    ambientIntensity: 1.05,
    background: '#efe7d8',
    cloud: '#fff3df',
    directionalIntensity: 1.75,
    fogFar: 58,
    fogNear: 18,
    shadowOpacity: 0.3,
    skyInclination: 0.48,
    sunPosition: [7, 6, 2],
    tint: '#f2d69a',
  },
  evening: {
    ambientIntensity: 0.72,
    background: '#2d2a35',
    cloud: '#b99086',
    directionalIntensity: 1.25,
    fogFar: 48,
    fogNear: 14,
    shadowOpacity: 0.36,
    skyInclination: 0.36,
    sunPosition: [-6, 3, 5],
    tint: '#f0a67d',
  },
  midnight: {
    ambientIntensity: 0.42,
    background: '#070b16',
    cloud: '#24304a',
    directionalIntensity: 0.82,
    fogFar: 44,
    fogNear: 10,
    shadowOpacity: 0.42,
    skyInclination: 0.12,
    sunPosition: [-3, 2, -4],
    tint: '#8fb4d9',
  },
  morning: {
    ambientIntensity: 1.18,
    background: '#eaf4f0',
    cloud: '#ffffff',
    directionalIntensity: 1.9,
    fogFar: 60,
    fogNear: 20,
    shadowOpacity: 0.24,
    skyInclination: 0.53,
    sunPosition: [3, 8, 3],
    tint: '#f4e7b2',
  },
  noon: {
    ambientIntensity: 1.3,
    background: '#eef8fa',
    cloud: '#f7ffff',
    directionalIntensity: 1.65,
    fogFar: 64,
    fogNear: 22,
    shadowOpacity: 0.18,
    skyInclination: 0.62,
    sunPosition: [1, 10, 1],
    tint: '#ffffff',
  },
};
