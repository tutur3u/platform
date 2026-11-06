import { handleControlRequest } from './control';
import { type DispatchEnv, dispatchScheduledJobs } from './dispatch';
import {
  type ImmediateNotificationsEnv,
  processImmediateNotifications,
} from './immediate-notifications';
import {
  CRON_TRIGGERS,
  IMMEDIATE_NOTIFICATIONS_CRON,
  scheduleSlot,
} from './jobs';
import type { Ledger } from './ledger';
import { CronLedger } from './ledger-object';
import { handleWebGate, type WebGateEnv } from './web-gate-http';

export { CronLedger, processImmediateNotifications };

type Env = WebGateEnv &
  DispatchEnv &
  ImmediateNotificationsEnv & {
    CRON_CONTROL_OPERATOR_TOKEN?: string;
    CRON_LEDGER: DurableObjectNamespace<CronLedger>;
  };

// A single ledger instance serializes every claim; volume is a few thousand
// small requests a day at most.
function ledgerFor(env: Env): () => Ledger {
  let stub: Ledger | undefined;
  return () => {
    stub ??= env.CRON_LEDGER.get(
      env.CRON_LEDGER.idFromName('cron-control-ledger')
    ) as unknown as Ledger;
    return stub;
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (request.method === 'GET' && pathname === '/health') {
      return Response.json(
        { ok: true },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }
    const webGate = await handleWebGate(request, env, (job, action) =>
      env.CRON_LEDGER.get(
        env.CRON_LEDGER.idFromName('cron-control-ledger')
      ).webCron(job, action)
    );
    if (webGate) return webGate;
    const control = await handleControlRequest(request, env, ledgerFor(env));
    if (control) return control;
    return Response.json({ message: 'Not found' }, { status: 404 });
  },
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    if (!CRON_TRIGGERS.includes(controller.cron))
      throw new Error('Unexpected cron trigger');
    const [immediate, jobs] = await Promise.allSettled([
      controller.cron === IMMEDIATE_NOTIFICATIONS_CRON
        ? processImmediateNotifications(env)
        : Promise.resolve(null),
      dispatchScheduledJobs(controller.cron, controller.scheduledTime, env, {
        fetch: (input, init) => fetch(input, init),
        ledger: ledgerFor(env),
        now: () => Date.now(),
        sleep: (milliseconds) =>
          new Promise((resolve) => setTimeout(resolve, milliseconds)),
      }),
    ]);
    if (jobs.status === 'fulfilled' && jobs.value.length > 0)
      console.log('Cron Control jobs completed', {
        cron: controller.cron,
        slot: scheduleSlot(controller.scheduledTime),
        jobs: jobs.value,
      });
    if (jobs.status === 'rejected')
      console.error('Cron Control dispatch failed', jobs.reason);
    if (immediate.status === 'rejected') throw immediate.reason;
    if (immediate.value)
      console.log('Immediate notification recovery completed', immediate.value);
  },
} satisfies ExportedHandler<Env>;
