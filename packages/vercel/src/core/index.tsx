'use client';

import { Analytics, type AnalyticsProps } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import type { ComponentProps } from 'react';
import { redactSensitiveUrl } from './redact-url';

export { redactSensitiveUrl } from './redact-url';

/** Vercel Analytics with credential-bearing URL parameters redacted. */
export function VercelAnalytics(props: AnalyticsProps) {
  const { beforeSend } = props;
  return (
    <Analytics
      {...props}
      beforeSend={(event) => {
        const next = beforeSend ? beforeSend(event) : event;
        return next && { ...next, url: redactSensitiveUrl(next.url) };
      }}
    />
  );
}

/** Vercel Speed Insights with credential-bearing URL parameters redacted. */
export function VercelInsights(props: ComponentProps<typeof SpeedInsights>) {
  const { beforeSend } = props;
  return (
    <SpeedInsights
      {...props}
      beforeSend={(event) => {
        const next = beforeSend ? beforeSend(event) : event;
        return next && { ...next, url: redactSensitiveUrl(next.url) };
      }}
    />
  );
}
