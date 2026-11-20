/** Synthetic fleet snapshot shared by the fleet sync tests. */
export function sampleFleetState(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    generatedAt: '2026-11-20T03:00:00.000Z',
    orchestrator: {
      label: 'Iris',
      state: 'running',
      lastActiveAt: '2026-11-20T02:59:00.000Z',
    },
    counts: { running: 2, waiting: 1, queued: 0, idle: 4, failed: 1 },
    machines: [
      {
        id: 'skr-m4',
        label: 'M4',
        status: 'online',
        lastSeenAt: '2026-11-20T02:59:30.000Z',
      },
    ],
    lanes: [
      {
        id: 'lane-1a2b',
        title: 'Mobile Mastermind sync',
        project: 'tuturuuu',
        provider: 'claude',
        machineId: 'skr-m4',
        state: 'running',
        updatedAt: '2026-11-20T02:58:00.000Z',
      },
    ],
    decisions: [
      {
        id: 'ship-fleet-sync',
        title: 'Ship fleet sync to production?',
        urgency: 'high',
        options: [
          { id: 'yes', label: 'Ship now' },
          { id: 'later', label: 'Wait' },
        ],
        recommendedOptionId: 'yes',
        createdAt: '2026-11-20T02:00:00.000Z',
      },
    ],
    ...overrides,
  };
}
