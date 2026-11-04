'use client';

import { SpeedInsights } from '@vercel/speed-insights/next';
import type { ComponentProps } from 'react';
import { redactSensitiveUrl } from './redact-url';

export { redactSensitiveUrl } from './redact-url';

// Vercel Web Analytics is intentionally not exported.
// It ran for every visitor without consent, so it was turned off for all
// visitors. `no-web-analytics.test.ts` fails if it is mounted again.

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
