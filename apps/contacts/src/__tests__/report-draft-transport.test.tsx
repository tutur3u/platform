/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import { InternalApiError } from '@tuturuuu/internal-api';
import { toast } from '@tuturuuu/ui/sonner';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/workspace/reports/report',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useReportMutations } from '@/app/[locale]/[wsId]/users/reports/[reportId]/hooks/use-report-mutations';

const fetchMock = vi.fn<typeof fetch>();
const wsId = 'workspace/one';
const reportId = 'report?one';
const draft = { title: '', content: ' \nObservation\n', feedback: '', score: null };
const failedSave = 'ws-reports.failed_save_report';
const clients: QueryClient[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function hook() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  clients.push(client);
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const rendered = renderHook(
    () =>
      useReportMutations({
        wsId,
        report: {
          id: reportId,
          user_id: 'student',
          group_id: 'group',
          report_approval_status: 'PENDING',
        },
        isNew: false,
        canApproveReports: true,
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    }
  );
  return { ...rendered, invalidate };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function failed(response: Response | Error) {
  if (response instanceof Error) fetchMock.mockRejectedValueOnce(response);
  else fetchMock.mockResolvedValueOnce(response);
  const { result, invalidate } = hook();
  let error: unknown;
  await act(async () => {
    try {
      await result.current.updateMutation.mutateAsync(draft);
    } catch (caught) {
      error = caught;
    }
  });
  expect(error).toBeInstanceOf(Error);
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(toast.success).not.toHaveBeenCalled();
  expect(invalidate).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledOnce();
  return error;
}

it.each([
  draft,
  { title: ' ', content: '', feedback: 'Line one\nLine two\n', score: null },
])('sends only four exact draft fields, then saves and invalidates: %j', async (payload) => {
  fetchMock.mockResolvedValueOnce(json({ success: true }));
  const { result, invalidate } = hook();
  await act(async () => {
    await result.current.updateMutation.mutateAsync(payload);
  });
  expect(fetchMock).toHaveBeenCalledOnce();
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(url).toBe('/api/v1/workspaces/workspace%2Fone/users/reports/report%3Fone');
  expect(init).toMatchObject({ method: 'PUT', cache: 'no-store' });
  expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
  expect(JSON.parse(String(init?.body))).toEqual(payload);
  expect(toast.success).toHaveBeenCalledWith('ws-reports.report_saved');
  expect(toast.error).not.toHaveBeenCalled();
  expect(invalidate.mock.calls.map(([options]) => options?.queryKey)).toEqual([
    ['ws', wsId, 'report', reportId, 'logs'],
    ['ws', wsId, 'approvals', 'reports'],
    ['ws', wsId, 'group-report-status-summary'],
    ['ws', wsId, 'group', 'group', 'reports-dashboard'],
    ['ws', wsId, 'group', 'group', 'user-report-status-summary'],
    ['ws', wsId, 'group', 'group', 'user', 'student', 'report', reportId],
    ['ws', wsId, 'group', 'group', 'user', 'student', 'reports'],
  ]);
  expect(vi.mocked(toast.success).mock.invocationCallOrder[0]).toBeLessThan(
    invalidate.mock.invocationCallOrder[0]!
  );
});

it.each([false, undefined, null, 'true', 1])(
  'rejects a non-Boolean acknowledgement %s',
  async (success) => {
    await failed(json({ success }));
    expect(toast.error).toHaveBeenCalledWith(failedSave);
  }
);

it.each([null, [], 'saved'])('rejects a non-object acknowledgement %s', async (body) => {
  await failed(json(body));
  expect(toast.error).toHaveBeenCalledWith(failedSave);
});

it('rejects a bodyless 204', async () => {
  await failed(new Response(null, { status: 204 }));
  expect(toast.error).toHaveBeenCalledWith(failedSave);
});

it.each([
  [409, 'Report save was not acknowledged', 'REPORT_SAVE_NOT_ACKNOWLEDGED'],
  [
    409,
    'Report delivery is in progress. Try again after it finishes.',
    'REPORT_PROCESSING',
  ],
  [403, 'Permission denied', 'FORBIDDEN'],
  [500, 'Unable to save report', 'SAVE_FAILED'],
] as const)(
  'preserves the explicit %s backend message and typed error',
  async (status, message, code) => {
    const error = await failed(json({ message, code }, status));
    expect(error).toBeInstanceOf(InternalApiError);
    expect(error).toMatchObject({ status, message, code });
    expect(toast.error).toHaveBeenCalledWith(message);
  }
);

it('preserves the parser error-field message', async () => {
  await failed(json({ error: 'Access refused' }, 403));
  expect(toast.error).toHaveBeenCalledWith('Access refused');
});

it.each([403, 409, 500])('localizes only the exact generic %s fallback', async (status) => {
  const error = await failed(new Response('upstream unavailable', { status }));
  expect(error).toMatchObject({
    status,
    message: `Internal API request failed: ${status}`,
  });
  expect(toast.error).toHaveBeenCalledWith(failedSave);
});

it('preserves challenge explanation and code', async () => {
  const error = await failed(
    json({ code: 'ABUSE_CHALLENGE_REQUIRED', message: 'Verify first' }, 403)
  );
  expect(error).toMatchObject({ status: 403, code: 'ABUSE_CHALLENGE_REQUIRED' });
  expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Verify first'));
  expect(toast.error).toHaveBeenCalledWith(
    expect.stringContaining('browser verification challenge')
  );
});

it('retains the real MFA parser reload and explicit message', async () => {
  const reload = vi.fn();
  vi.stubGlobal(
    'window',
    new Proxy(window, {
      get(target, key) {
        if (key === 'location') return { pathname: '/workspace/reports', reload };
        return Reflect.get(target, key, target);
      },
    })
  );
  const error = await failed(
    json({ code: 'MFA_REQUIRED', message: 'Verify MFA' }, 403)
  );
  expect(error).toMatchObject({ status: 403, code: 'MFA_REQUIRED' });
  expect(reload).toHaveBeenCalledOnce();
  expect(toast.error).toHaveBeenCalledWith('Verify MFA');
});

it('fails a network rejection without announcing a save', async () => {
  const error = new TypeError('Network unavailable');
  expect(await failed(error)).toBe(error);
  expect(toast.error).toHaveBeenCalledWith(error.message);
});

it('fails malformed successful JSON without announcing a save', async () => {
  const error = await failed(new Response('{broken', { status: 200 }));
  expect(error).toBeInstanceOf(SyntaxError);
  expect(toast.error).toHaveBeenCalledWith((error as Error).message);
});

it('keeps the mutation pending until transport acknowledgement arrives', async () => {
  let resolveResponse!: (response: Response) => void;
  fetchMock.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveResponse = resolve;
    })
  );
  const { result, invalidate } = hook();
  let pending!: Promise<unknown>;
  await act(async () => {
    pending = result.current.updateMutation.mutateAsync({ ...draft, score: 0 });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(result.current.updateMutation.isPending).toBe(true);
  expect(toast.success).not.toHaveBeenCalled();
  expect(invalidate).not.toHaveBeenCalled();
  expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)).score).toBe(0);
  await act(async () => {
    resolveResponse(json({ success: true }));
    await pending;
  });
  expect(toast.success).toHaveBeenCalledWith('ws-reports.report_saved');
});
