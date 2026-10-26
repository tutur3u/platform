import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { authorizeDevboxAgentMock, heartbeatDevboxRunnerMock } = vi.hoisted(
  () => ({
    authorizeDevboxAgentMock: vi.fn(),
    heartbeatDevboxRunnerMock: vi.fn(),
  })
);

vi.mock('@/lib/devboxes/agent-auth', () => ({
  authorizeDevboxAgent: authorizeDevboxAgentMock,
}));
vi.mock('@/lib/devboxes/agent-store', () => ({
  heartbeatDevboxRunner: heartbeatDevboxRunnerMock,
}));

import { DEVBOX_AGENT_API_ENABLED_ENV } from '@/lib/devboxes/agent-traffic-gate';
import { POST as heartbeat } from './heartbeat/route';

const original = process.env[DEVBOX_AGENT_API_ENABLED_ENV];
const beat = (resources: unknown) =>
  heartbeat(
    new Request('http://localhost/api/v1/devboxes/agents/heartbeat', {
      body: JSON.stringify({ capabilities: { resources } }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })
  );

describe('devbox heartbeat disk headroom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env[DEVBOX_AGENT_API_ENABLED_ENV] = 'true';
    authorizeDevboxAgentMock.mockResolvedValue({
      ok: true,
      runner: { heartbeatEnabled: true, id: 'runner-1' },
    });
    heartbeatDevboxRunnerMock.mockResolvedValue({ message: 'ok' });
  });
  afterAll(() => {
    if (original === undefined)
      delete process.env[DEVBOX_AGENT_API_ENABLED_ENV];
    else process.env[DEVBOX_AGENT_API_ENABLED_ENV] = original;
  });

  it('accepts and forwards a bucketed disk report', async () => {
    const disk = { freeGiB: 50, freePct: 10, inodeFreePct: 95 };
    const response = await beat({ disk });
    expect(response.status).toBe(200);
    expect(heartbeatDevboxRunnerMock).toHaveBeenCalledWith(
      'runner-1',
      expect.objectContaining({ resources: { disk } })
    );
  });

  it.each([
    { freeGiB: '50', freePct: 10 },
    { freeGiB: ['50'], freePct: 10 },
    { freeGiB: 1.5, freePct: 10 },
    { freeGiB: 50, freePct: 12 },
    { freeGiB: 50, freePct: 10, path: '/' },
  ])('rejects a malformed disk report: %j', async (disk) => {
    const response = await beat({ disk });
    expect(response.status).toBe(400);
    expect(heartbeatDevboxRunnerMock).not.toHaveBeenCalled();
  });
});
