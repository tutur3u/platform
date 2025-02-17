import type {
  AuroraForecast,
  AuroraMLMetrics,
  AuroraStatisticalMetrics,
} from '@tutur3u/types/db';

export async function fetchAuroraForecast(): Promise<AuroraForecast> {
  const res = await fetch('/api/v1/aurora/forecast');
  if (!res.ok) throw new Error('Failed to fetch forecast data');
  return res.json();
}

export async function fetchAuroraStatisticalMetrics(): Promise<
  AuroraStatisticalMetrics[]
> {
  const res = await fetch('/api/v1/aurora/statistical-metrics');
  if (!res.ok) throw new Error('Failed to fetch statistical metrics');
  return res.json();
}

export async function fetchAuroraMLMetrics(): Promise<AuroraMLMetrics[]> {
  const res = await fetch('/api/v1/aurora/ml-metrics');
  if (!res.ok) throw new Error('Failed to fetch ML metrics');
  return res.json();
}
