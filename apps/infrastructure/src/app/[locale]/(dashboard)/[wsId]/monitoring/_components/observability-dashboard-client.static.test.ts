import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ObservabilityDashboardClient cron runner recovery panel', () => {
  it('wires focused cron runner recovery actions into the cron dashboard', () => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        'src/app/[locale]/(dashboard)/[wsId]/monitoring/_components/observability-dashboard-client.tsx'
      ),
      'utf8'
    );

    expect(source).toContain('requestCronRunnerRecovery');
    expect(source).toContain("focus === 'cron-runner'");
    expect(source).toContain("cronT('runner_recovery.ensure_action')");
    expect(source).toContain("cronT('runner_recovery.restart_action')");
    expect(source).toContain('cronSnapshot?.runnerRecoveryRequest');
    expect(source).toContain('cronSnapshot.recovery.canRequest === false');
    expect(source).toContain('cronSnapshot?.recovery.blockedReason');
    expect(source).toContain('data-testid="cron-diagnostics"');
    expect(source).toContain('cronSnapshot?.diagnostics ?? []');
    expect(source).toContain('cronSnapshot?.recovery.watcherStatus');
    expect(source).toContain('cronSnapshot?.recovery.directControl.watchdog');
    expect(source).toContain('cron.summary.next_run_stale_meta');
  });
});
