'use client';

import type { AnalyticsProps } from '@vercel/analytics/react';
import type { SpeedInsights } from '@vercel/speed-insights/next';
import type { ComponentProps } from 'react';

export { redactSensitiveUrl } from './redact-url';

// Provider activation requires a separate USER decision and reviewed consent loader.
export function VercelAnalytics(_props: AnalyticsProps) {
  return null;
}

export function VercelInsights(_props: ComponentProps<typeof SpeedInsights>) {
  return null;
}
