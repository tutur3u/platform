import type { HiveCameraView, HiveSeason, HiveWeather } from './types';

export const hiveSeasonOrder: HiveSeason[] = [
  'spring',
  'summer',
  'autumn',
  'winter',
];

export const hiveWeatherOrder: HiveWeather[] = [
  'clear',
  'cloudy',
  'rain',
  'storm',
  'snow',
  'fog',
];

export const hiveCameraViewOrder: HiveCameraView[] = [
  'isometric',
  'wide',
  'close',
  'topDown',
];

export const cameraViewPresets: Record<
  HiveCameraView,
  { fov: number; position: [number, number, number] }
> = {
  close: { fov: 42, position: [5.2, 4.4, 5.2] },
  isometric: { fov: 44, position: [8, 7.5, 8] },
  topDown: { fov: 38, position: [0, 12, 0.01] },
  wide: { fov: 48, position: [11, 8.5, 11] },
};

export function getWeatherCloudCount(weather: HiveWeather) {
  if (weather === 'clear') return 3;
  if (weather === 'cloudy' || weather === 'fog') return 5;
  return 7;
}
