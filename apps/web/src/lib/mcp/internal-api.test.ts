import { afterEach, describe, expect, it, vi } from 'vitest';
import type { McpActor } from './contracts';
import { McpAccessError } from './contracts';
import { createMcpReadFetch } from './internal-api';

const ws = '11111111-1111-4111-8111-111111111111';
const actor = {
  userId: 'u',
  providerAccessToken: 'token',
} as unknown as McpActor;

function readFetch() {
  const impl = vi.fn(async () => new Response('[]', { status: 200 }));
  return {
    fetch: createMcpReadFetch(actor, impl as unknown as typeof fetch),
    impl,
  };
}

afterEach(() => vi.unstubAllEnvs());

describe('MCP read allowlist: calendar origin', () => {
  it('allows the calendar subdomain events read', async () => {
    const { fetch, impl } = readFetch();
    await fetch(
      `https://calendar.tuturuuu.com/api/v1/workspaces/${ws}/calendar/events`
    );
    expect(impl).toHaveBeenCalledOnce();
  });

  it('refuses the apex mount path until calendar is an active mount', async () => {
    const { fetch, impl } = readFetch();
    await expect(
      fetch(
        `https://tuturuuu.com/calendar/api/v1/workspaces/${ws}/calendar/events`
      )
    ).rejects.toBeInstanceOf(McpAccessError);
    expect(impl).not.toHaveBeenCalled();
  });

  it('allows the apex mount path once calendar is an active mount', async () => {
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS', 'calendar');
    const { fetch, impl } = readFetch();
    await fetch(
      `https://tuturuuu.com/calendar/api/v1/workspaces/${ws}/calendar/events`
    );
    expect(impl).toHaveBeenCalledOnce();
  });

  it.each([
    `https://tuturuuu.com/api/v1/workspaces/${ws}/calendar/events`,
    `https://tuturuuu.com/calendar/other/api/v1/workspaces/${ws}/calendar/events`,
    `https://tuturuuu.com/calendar-team/api/v1/workspaces/${ws}/calendar/events`,
    `https://tuturuuu.com/calendar/api/v1/workspaces/${ws}/calendar/events/x`,
    `https://tuturuuu.com/calendar/api/v1/workspaces/${ws}/calendar/events/../tasks`,
    `https://tasks.tuturuuu.com/calendar/api/v1/workspaces/${ws}/calendar/events`,
    `https://calendar.tuturuuu.com/calendar/api/v1/workspaces/${ws}/calendar/events`,
    `https://user:pw@tuturuuu.com/calendar/api/v1/workspaces/${ws}/calendar/events`,
  ])('keeps everything else outside the allowlist: %s', async (url) => {
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS', 'calendar');
    const { fetch, impl } = readFetch();
    await expect(fetch(url)).rejects.toBeInstanceOf(McpAccessError);
    expect(impl).not.toHaveBeenCalled();
  });

  it('stays GET-only', async () => {
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS', 'calendar');
    const { fetch } = readFetch();
    await expect(
      fetch(
        `https://tuturuuu.com/calendar/api/v1/workspaces/${ws}/calendar/events`,
        {
          method: 'POST',
        }
      )
    ).rejects.toBeInstanceOf(McpAccessError);
  });
});
