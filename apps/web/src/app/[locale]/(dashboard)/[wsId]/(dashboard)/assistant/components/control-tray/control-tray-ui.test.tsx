import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ControlTray from './control-tray';

const live = vi.hoisted(() => ({
  connected: false,
  connectionStatus: 'disconnected',
  client: { ws: null, sendAudioStreamEnd: vi.fn() },
  disconnect: vi.fn().mockResolvedValue(undefined),
}));
const stream = vi.hoisted(() => ({ stop: vi.fn(), start: vi.fn() }));
vi.mock('@/hooks/use-live-api', () => ({ useLiveAPIContext: () => live }));
vi.mock('@/hooks/use-webcam', () => ({ useWebcam: () => stream }));
vi.mock('@/hooks/use-screen-capture', () => ({
  useScreenCapture: () => stream,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('../../audio/audio-recorder', () => ({
  AudioRecorder: class {
    on() {
      return this;
    }
    off() {
      return this;
    }
    start = vi.fn().mockResolvedValue(undefined);
    stop = vi.fn();
  },
}));

describe('compact live composer exit', () => {
  beforeEach(() => {
    live.connected = false;
    live.connectionStatus = 'disconnected';
  });

  it.each([false, true])(
    'returns to chat after ending, with typing open=%s',
    (textChatOpen) => {
      const onReturnToChat = vi.fn();
      const onRestartSession = vi.fn();
      const onToggleChat = vi.fn();
      render(
        <ControlTray
          compact
          videoRef={createRef()}
          supportsVideo
          textChatOpen={textChatOpen}
          onToggleChat={onToggleChat}
          onReturnToChat={onReturnToChat}
          onRestartSession={onRestartSession}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'return_to_chat' }));
      expect(onReturnToChat).toHaveBeenCalledOnce();
      expect(onToggleChat).not.toHaveBeenCalled();
      expect(onRestartSession).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'new_session' })).toBeEnabled();
      expect(
        screen.queryByRole('button', { name: 'open_chat' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'close_chat' })
      ).not.toBeInTheDocument();
    }
  );

  it('keeps the typing toggle during an active call', () => {
    live.connected = true;
    const onToggleChat = vi.fn();
    render(
      <ControlTray
        compact
        videoRef={createRef()}
        supportsVideo
        onReturnToChat={vi.fn()}
        onToggleChat={onToggleChat}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'open_chat' }));
    expect(onToggleChat).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole('button', { name: 'return_to_chat' })
    ).not.toBeInTheDocument();
  });
});
