// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';

const api = vi.hoisted(() => ({ join: vi.fn() }));
vi.mock('@tuturuuu/internal-api/meet-whiteboard', () => ({
  joinMeetWhiteboard: api.join,
}));
vi.mock('../../../../../whiteboard/src/react/excalidraw-canvas', () => ({
  default: (props: Record<string, any>) => {
    props.excalidrawAPI?.({
      getSceneElements: () => [],
      getAppState: () => ({}),
      getFiles: () => ({}),
      updateScene: () => {},
      addFiles: () => {},
    });
    return <div data-testid="canvas" />;
  },
}));
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { error: vi.fn() } }));

const { BoardRoom } = await import('./board-room');
const boardId = '33333333-4444-4555-8666-777777777777';

const sockets: { url: string; protocols: string[] }[] = [];
beforeEach(() => {
  sockets.length = 0;
  class FakeSocket {
    readyState = 0;
    onopen: null | (() => void) = null;
    onclose: null | (() => void) = null;
    onerror: null | (() => void) = null;
    onmessage: null | ((e: { data: string }) => void) = null;
    constructor(url: string, protocols: string[]) {
      sockets.push({ url, protocols });
    }
    send() {}
    close() {}
  }
  vi.stubGlobal('WebSocket', FakeSocket);
  api.join.mockResolvedValue({
    endpoint: 'wss://meet-realtime.tuturuuu.com/whiteboard',
    token: 'abc.def',
    role: 'edit',
    refreshSeconds: 60,
    board: { id: boardId, title: 'Plan' },
    user: { id: 'u', displayName: 'U' },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('opens the board socket with the ticket as a subprotocol', async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <BoardRoom
          meetingId="m"
          boardId={boardId}
          title="Plan"
          onBack={() => {}}
          onClosed={() => {}}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  await screen.findByTestId('canvas');
  await waitFor(() => expect(sockets).toHaveLength(1));
  expect(sockets[0]).toEqual({
    url: 'wss://meet-realtime.tuturuuu.com/whiteboard',
    protocols: ['tuturuuu.whiteboard', 'bearer.abc.def'],
  });
  expect(screen.getByRole('status').textContent).not.toBe('');
});

it('says so when the browser refuses the socket', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  class Refusing {
    constructor() {
      throw new SyntaxError('refused');
    }
  }
  vi.stubGlobal('WebSocket', Refusing);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <BoardRoom
          meetingId="m"
          boardId={boardId}
          title="Plan"
          onBack={() => {}}
          onClosed={() => {}}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  await screen.findByTestId('canvas');
  await vi.advanceTimersByTimeAsync(40_000);
  expect(await screen.findByText('Could not connect')).toBeTruthy();
  vi.useRealTimers();
});
