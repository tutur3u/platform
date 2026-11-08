import { NextRequest } from 'next/dist/server/web/spec-extension/request';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-start/server-only', () => ({}));
const local = vi.hoisted(() => ({
  reorder: vi.fn(
    async (
      _request: Request,
      _context: { params: Promise<{ wsId: string }> }
    ) => new Response('local-reorder', { status: 202 })
  ),
}));
vi.mock(
  '../app/api/v1/workspaces/[wsId]/calendar/categories/reorder/route',
  () => ({
    GET: undefined,
    HEAD: undefined,
    POST: undefined,
    PUT: local.reorder,
    PATCH: undefined,
    DELETE: undefined,
    OPTIONS: undefined,
  })
);

import {
  calendarEndpoints,
  dispatchCalendarEndpoint,
} from './api-registry.server';

const request = (path: string, method = 'GET') =>
  new NextRequest(`https://calendar.test${path}`, { method });
describe('native Calendar local endpoints', () => {
  it('keeps each of the57 canonical local routes registered once', () => {
    expect(calendarEndpoints).toHaveLength(57);
    expect(new Set(calendarEndpoints.map(({ pattern }) => pattern)).size).toBe(
      57
    );
  });
  it('chooses static reorder before the dynamic category route and preserves context', async () => {
    const req = request(
      '/api/v1/workspaces/ws/calendar/categories/reorder?x=1',
      'PUT'
    );
    const response = await dispatchCalendarEndpoint(req);
    expect(response?.status).toBe(202);
    expect(await response?.text()).toBe('local-reorder');
    expect(local.reorder.mock.calls[0]?.[0]).toBe(req);
    const context = local.reorder.mock.calls[0]?.[1];
    expect(await context?.params).toEqual({ wsId: 'ws' });
  });
  it('does not dispatch a dynamic supplier when the matched static method is unsupported', async () => {
    const response = await dispatchCalendarEndpoint(
      request('/api/v1/workspaces/ws/calendar/categories/reorder')
    );
    expect(response?.status).toBe(405);
    expect(response?.headers.get('allow')).toContain('PUT');
  });
  it('answers OPTIONS without loading the provider supplier', async () => {
    const response = await dispatchCalendarEndpoint(
      request('/api/v1/calendar/auth/sync', 'OPTIONS')
    );
    expect(response?.status).toBe(204);
    expect(response?.headers.get('allow')).toContain('DELETE');
  });
  it('returns400 for malformed route parameters and null only for unmatched routes', async () => {
    expect(
      (
        await dispatchCalendarEndpoint(
          request('/api/v1/workspaces/%ZZ/calendar/events')
        )
      )?.status
    ).toBe(400);
    expect(await dispatchCalendarEndpoint(request('/api/unowned'))).toBeNull();
  });
});
