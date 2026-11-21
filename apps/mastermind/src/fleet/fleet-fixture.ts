/** Synthetic fleet-sync response for the Mastermind tests, relative to `now`. */
export function fleetResponseFixture(now: number) {
  const at = (offsetMs: number) => new Date(now + offsetMs).toISOString();
  return {
    receivedAt: at(-5_000),
    answers: {
      'answered-ask': {
        action: 'approve',
        optionId: 'yes',
        revision: 2,
        answeredAt: at(-60_000),
        pickedUp: false,
      },
    },
    state: {
      version: 1,
      generatedAt: at(-10_000),
      orchestrator: { label: 'Iris', state: 'running' },
      counts: { running: 3, waiting: 1, queued: 0, idle: 0, failed: 1 },
      machines: [
        { id: 'studio-1', label: 'Studio One', status: 'online' },
        {
          id: 'devbox',
          label: 'Devbox',
          status: 'stale',
          lastSeenAt: at(-180_000),
        },
      ],
      lanes: [
        {
          id: 'calendar-cutover',
          title: 'calendar-cutover',
          machineId: 'studio-1',
          state: 'running',
          updatedAt: at(-30_000),
        },
        {
          id: 'meet-signaling',
          title: 'meet-signaling',
          machineId: 'studio-1',
          state: 'failed',
          updatedAt: at(-90_000),
        },
      ],
      decisions: [
        {
          id: 'roll-back',
          title: 'Roll back the Calendar Worker deploy?',
          why: 'Error rate rose after the promotion.',
          defaultOutcome: 'Iris rolls back at the deadline.',
          requester: 'Iris · calendar-cutover',
          urgency: 'urgent',
          options: [
            { id: 'rollback', label: 'Roll back now' },
            { id: 'fix', label: 'Fix forward' },
          ],
          recommendedOptionId: 'rollback',
          createdAt: at(-300_000),
          deadlineAt: at(1_140_000),
        },
        {
          id: 'answered-ask',
          title: 'Ship fleet sync?',
          urgency: 'high',
          options: [{ id: 'yes', label: 'Ship now' }],
          createdAt: at(-600_000),
        },
        {
          id: 'ci-sample',
          title: 'Daily CI sample recorded',
          urgency: 'fyi',
          createdAt: at(-900_000),
        },
        {
          id: 'gh-login',
          kind: 'login',
          title: 'GitHub · gh auth login',
          urgency: 'high',
          createdAt: at(-120_000),
          login: {
            service: 'github',
            flow: 'device',
            state: 'waiting',
            url: 'https://github.com/login/device',
            userCode: 'ABCD-1234',
            expiresAt: at(600_000),
            machineId: 'devbox',
          },
        },
      ],
      resolved: [
        {
          id: 'retire-cron',
          title: 'Retire the cron?',
          answeredVia: 'whatsapp',
          outcome: 'Retire it',
          resolvedAt: at(-1_200_000),
        },
      ],
      release: {
        main: { state: 'frozen', reason: 'release train', queued: 3 },
        production: {
          state: 'healthy',
          sha: '213ede7',
          deployedAt: at(-1_500_000),
        },
        migrations: { pending: 1, state: 'gated' },
        incidents: [],
      },
    },
  };
}
