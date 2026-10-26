/**
 * `@tuturuuu/vercel` in a bridged Worker app. Vercel serves the Analytics and
 * Speed Insights scripts (`/_vercel/insights`, `/_vercel/speed-insights`) only
 * on its own hosting, so on Workers both components render nothing instead of
 * requesting scripts that 404.
 */
export function VercelAnalytics(_props: Record<string, unknown>) {
  return null;
}

export function VercelInsights(_props: Record<string, unknown>) {
  return null;
}
