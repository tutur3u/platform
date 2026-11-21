// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import { INITIAL_CALL_STATE } from '../lib/call-state';
import type { MeetRoomController } from '../lib/room-controller';
import { CallStage } from './call-stage';

vi.mock('./participant-tile', () => ({
  ParticipantTile: ({
    focusKey,
    className,
  }: {
    focusKey: string;
    className: string;
  }) => <div data-testid={focusKey} className={className} />,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const person = (userId: string, videoEnabled = true) => ({
  userId,
  displayName: userId,
  media: { audioEnabled: true, videoEnabled, screenEnabled: false },
});

function stubStageSize(width: number, height: number) {
  const observers: ((entries: unknown[]) => void)[] = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: (entries: unknown[]) => void) {
        observers.push(callback);
      }
      observe() {}
      disconnect() {}
    }
  );
  return (nextWidth = width, nextHeight = height) =>
    act(() => {
      for (const callback of observers)
        callback([{ contentRect: { width: nextWidth, height: nextHeight } }]);
    });
}

function renderRoom(props: { selfInGrid?: boolean; hideSelfCamera?: boolean }) {
  const room = {
    remoteMedia: {},
    state: {
      ...INITIAL_CALL_STATE,
      selfUserId: 'me',
      participants: { me: person('me'), you: person('you') },
    },
  } as unknown as MeetRoomController;
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CallStage
        room={room}
        layout="grid"
        focus={null}
        onFocus={vi.fn()}
        onChat={vi.fn()}
        {...props}
      />
    </NextIntlClientProvider>
  );
}

it('keeps the self tile in the grid unless the caller hides it', () => {
  renderRoom({});
  expect(screen.getByTestId('me:camera')).toBeDefined();
  cleanup();
  renderRoom({ hideSelfCamera: true });
  expect(screen.queryByTestId('me:camera')).toBeNull();
  cleanup();
  renderRoom({ hideSelfCamera: true, selfInGrid: true });
  expect(screen.getByTestId('me:camera')).toBeDefined();
  cleanup();
  renderRoom({ selfInGrid: false });
  expect(screen.queryByTestId('me:camera')).toBeNull();
});

it('sizes every tile to the measured stage, including the self tile', () => {
  const resize = stubStageSize(1000, 600);
  const { container } = renderRoom({ selfInGrid: true });
  expect(screen.getByTestId('me:camera').className).not.toContain('w-(--tile-w)');
  resize();
  expect(screen.getByTestId('me:camera').className).toContain('w-(--tile-w)');
  expect(screen.getByTestId('you:camera').className).toContain('w-(--tile-w)');
  const widthOf = () =>
    container
      .querySelector<HTMLElement>('[style*="--tile-w"]')
      ?.style.getPropertyValue('--tile-w');
  const wide = Number.parseInt(widthOf() ?? '0', 10);
  expect(wide).toBeGreaterThan(0);
  resize(500, 300);
  const narrow = Number.parseInt(widthOf() ?? '0', 10);
  expect(narrow).toBeGreaterThan(0);
  expect(narrow).toBeLessThan(wide);
});
