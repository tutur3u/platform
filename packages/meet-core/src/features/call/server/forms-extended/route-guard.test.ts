import { afterEach, expect, it, vi } from 'vitest';
import { meetExtendedFormsRoute } from './route-guard';

const run = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('../room-service', () => ({ roomRoute: run }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

it.each([undefined, 'false', '1', 'TRUE'])(
  'denies before room auth when extended Forms is %s',
  async (flag) => {
    vi.stubEnv('MEET_FORMS_ENABLED', 'true');
    vi.stubEnv('MEET_FORMS_EXTENDED_ENABLED', flag);
    const response = await meetExtendedFormsRoute(
      new Request('https://meet.test/extended'),
      'fixture',
      vi.fn()
    );
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(run).not.toHaveBeenCalled();
  }
);

it('requires the independent core Forms gate and only then calls roomRoute', async () => {
  vi.stubEnv('MEET_FORMS_EXTENDED_ENABLED', 'true');
  const request = new Request('https://meet.test/extended');
  const handler = vi.fn();
  vi.stubEnv('MEET_FORMS_ENABLED', undefined);
  expect(
    (await meetExtendedFormsRoute(request, 'fixture', handler)).status
  ).toBe(404);
  expect(run).not.toHaveBeenCalled();
  vi.stubEnv('MEET_FORMS_ENABLED', 'true');
  await meetExtendedFormsRoute(request, 'fixture', handler);
  expect(run).toHaveBeenCalledExactlyOnceWith(request, 'fixture', handler);
});
