export { redactSensitiveUrl } from './redact-url';

// Vercel Web Analytics and Speed Insights are intentionally not exported.
// Both ran for every visitor without consent, so they were turned off for all
// visitors. `no-vercel-telemetry.test.ts` fails if either is mounted again.
