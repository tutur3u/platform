import { getCloudflareContext } from '@opennextjs/cloudflare/cloudflare-context';
import { NextResponse } from 'next/server';
import { FLEET_NO_STORE, fleetError } from '@/lib/mastermind/fleet/http';

/** Relay only this job's operator actions. Cron Control owns the credential. */
export async function relayMobileIssueControl(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!authorization || !/^Bearer \S{32,256}$/u.test(authorization))
    return fleetError('not_found', 404);
  const action = new URL(request.url).searchParams.get('action');
  if (action !== 'stop' && action !== 'resume')
    return fleetError('not_found', 404);
  try {
    const binding = getCloudflareContext().env.CRON_CONTROL;
    if (!binding) return fleetError('unavailable', 503);
    const response = await binding.fetch(
      new Request(
        `https://cron-control.internal/control/jobs/mobile-crashlytics-alerts/${action}`,
        {
          method: 'POST',
          headers: { authorization },
          signal: AbortSignal.timeout(5000),
        }
      )
    );
    if (response.status !== 200) {
      await response.body?.cancel();
      return response.status === 404
        ? fleetError('not_found', 404)
        : fleetError('unavailable', 503);
    }
    const result = (await response.json()) as { state?: { stopped?: boolean } };
    const stopped = action === 'stop';
    if (result?.state?.stopped !== stopped)
      return fleetError('unavailable', 503);
    return NextResponse.json({ stopped }, { headers: FLEET_NO_STORE });
  } catch {
    return fleetError('unavailable', 503);
  }
}
