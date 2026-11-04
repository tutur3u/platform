/**
 * `@tuturuuu/vercel` in a bridged Worker app. Vercel serves the Speed Insights
 * script (`/_vercel/speed-insights`) only on its own hosting, so on Workers the
 * component renders nothing instead of requesting a script that 404s.
 * Web Analytics is not exported at all; see `@tuturuuu/vercel`.
 */
export function VercelInsights(_props: Record<string, unknown>) {
  return null;
}
