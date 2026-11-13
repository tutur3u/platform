// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { AI_TEMP_AUTH_HEADER } from '@tuturuuu/utils/ai-temp-auth-constants';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMiraRequestPreparer } from './mira-chat-transport';
import {
  getMiraTempAuthHeaders,
  revokeMiraTempAuthToken,
} from './mira-temp-auth-client';
import { useMiraTempAuthPrefetch } from './use-mira-temp-auth-prefetch';

const body = { wsId: 'workspace-a', creditSource: 'personal' as const };
let intersect: (visible: boolean) => void;
let visible = true;
let tokenRequests = 0;
const tokenFetch = vi.fn(
  async (url: RequestInfo | URL, _options?: RequestInit) => {
    if (url.toString().endsWith('/token')) tokenRequests++;
    return new Response(
      JSON.stringify({
        token: 'disposable-test-value',
        expiresAt: Date.now() + 60_000,
      })
    );
  }
);
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}
function Panel({ enabled = true }: { enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const warm = useMiraTempAuthPrefetch(body, enabled, ref);
  return (
    <div ref={ref}>
      <input onFocus={warm} onChange={warm} aria-label="Message" />
    </div>
  );
}
function mount(enabled = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <Panel enabled={enabled} />
    </QueryClientProvider>
  );
  act(() => intersect(true));
  return view;
}
beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', tokenFetch);
  await revokeMiraTempAuthToken();
  tokenRequests = 0;
  tokenFetch.mockClear();
  visible = true;
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() =>
    visible ? 'visible' : 'hidden'
  );
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        intersect = (isIntersecting) => callback([{ isIntersecting }]);
      }
      observe() {}
      disconnect() {}
    }
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('Mira auth warming', () => {
  it('warms on visible mount, focus and typing reuse it, and two sends use no extra token request', async () => {
    const measure = vi.spyOn(performance, 'measure');
    mount();
    await flush();
    expect(tokenRequests).toBe(1);
    fireEvent.focus(screen.getByLabelText('Message'));
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'Hi' },
    });
    await flush();
    const prepare = createMiraRequestPreparer();
    for (let i = 0; i < 2; i++) {
      const request = await prepare({
        id: 'chat',
        messages: [],
        body,
        trigger: 'submit-message',
        messageId: undefined,
        requestMetadata: undefined,
        credentials: 'include',
        api: '/api/ai/chat',
        headers: {},
      });
      expect(new Headers(request.headers).get(AI_TEMP_AUTH_HEADER)).toBe(
        'disposable-test-value'
      );
    }
    expect(tokenRequests).toBe(1);
    expect(measure).toHaveBeenCalledWith('mira:temp-auth-cache-hit', {
      start: expect.any(Number),
    });
  });
  it('refreshes before expiry while active, then stops when idle', async () => {
    mount();
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(55_000);
    });
    expect(tokenRequests).toBe(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180_000);
    });
    expect(tokenRequests).toBe(2);
    fireEvent.focus(screen.getByLabelText('Message'));
    await flush();
    expect(tokenRequests).toBe(3);
  });
  it('stops while hidden and warms again on visibility', async () => {
    mount();
    await flush();
    visible = false;
    fireEvent(document, new Event('visibilitychange'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180_000);
    });
    expect(tokenRequests).toBe(1);
    visible = true;
    fireEvent(document, new Event('visibilitychange'));
    await flush();
    expect(tokenRequests).toBe(2);
  });
  it('does not refresh an offscreen panel or a subscription model', async () => {
    const view = mount(false);
    await flush();
    expect(tokenRequests).toBe(0);
    view.unmount();
    mount();
    await flush();
    act(() => intersect(false));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180_000);
    });
    expect(tokenRequests).toBe(1);
  });
  it('acquires a distinct token for a changed credit scope', async () => {
    mount();
    await flush();
    await getMiraTempAuthHeaders({
      ...body,
      creditSource: 'workspace',
      creditWsId: 'workspace-b',
    });
    expect(tokenRequests).toBe(2);
    const [, options] = tokenFetch.mock.calls.at(-1) ?? [];
    expect(JSON.parse(String(options?.body))).toEqual({
      ...body,
      creditSource: 'workspace',
      creditWsId: 'workspace-b',
    });
  });
  it('does not retry a failed warm-up until another interaction', async () => {
    tokenFetch.mockImplementationOnce(async () => {
      tokenRequests++;
      return new Response(null, { status: 503 });
    });
    mount();
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180_000);
    });
    expect(tokenRequests).toBe(1);
    fireEvent.focus(screen.getByLabelText('Message'));
    await flush();
    expect(tokenRequests).toBe(2);
  });
  it('deduplicates concurrent cold requests and fences revocation', async () => {
    let resolve!: (response: Response) => void;
    tokenFetch.mockImplementationOnce(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        })
    );
    const first = getMiraTempAuthHeaders(body);
    const second = getMiraTempAuthHeaders(body);
    expect(
      tokenFetch.mock.calls.filter(([url]) => url.toString().endsWith('/token'))
    ).toHaveLength(1);
    await revokeMiraTempAuthToken();
    resolve(
      new Response(
        JSON.stringify({
          token: 'revoked-test-value',
          expiresAt: Date.now() + 60_000,
        })
      )
    );
    expect(await first).toEqual({});
    expect(await second).toEqual({});
    expect(await getMiraTempAuthHeaders(body)).toHaveProperty(
      AI_TEMP_AUTH_HEADER,
      'disposable-test-value'
    );
  });
});
