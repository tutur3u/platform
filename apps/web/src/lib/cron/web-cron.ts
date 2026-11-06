import {
  type CronDrainOptions,
  withCronLogDrain,
} from '@/lib/infrastructure/log-drain';
import { withWebCronBudget } from './web-cron-budget';
import {
  isCloudflareCron,
  WEB_CRON_PATHS,
  withWebCronFence,
} from './web-cron-fence';

export function withWebCronLogDrain(
  options: CronDrainOptions,
  handler: () => Promise<Response>
) {
  const request = options.request;
  const path = options.path;
  if (!request || !(path in WEB_CRON_PATHS))
    throw new Error('Unknown web cron adapter');
  // The route is a repository constant, checked against the same path catalog.
  const entry = Object.keys(WEB_CRON_PATHS).find(
    (key): key is keyof typeof WEB_CRON_PATHS => key === path
  );
  if (!entry) throw new Error('Unknown web cron path');
  return withCronLogDrain(options, () =>
    withWebCronFence(
      request,
      entry,
      () =>
        isCloudflareCron(request) ? withWebCronBudget(handler) : handler(),
      {
        CRON_SECRET: process.env.CRON_SECRET,
        VERCEL_CRON_SECRET: process.env.VERCEL_CRON_SECRET,
        WEB_CRON_GATE_ORIGIN: process.env.WEB_CRON_GATE_ORIGIN,
        CRON_CONTROL_WEB_GATE_TOKEN: process.env.CRON_CONTROL_WEB_GATE_TOKEN,
      }
    )
  );
}
