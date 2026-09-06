import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import VideoPreview from './video-preview';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

describe('live video preview lifecycle', () => {
  it('keeps the same stream attached during transcript updates and uses the latest close callback', () => {
    let ended!: () => void;
    const track = {
      addEventListener: vi.fn((_name: string, callback: () => void) => {
        ended = callback;
      }),
      removeEventListener: vi.fn(),
    };
    const stream = { getVideoTracks: () => [track] } as unknown as MediaStream;
    const initialClose = vi.fn();
    const latestClose = vi.fn();
    const { rerender, unmount } = render(
      <VideoPreview stream={stream} type="screen" onClose={initialClose} />
    );
    rerender(
      <VideoPreview stream={stream} type="screen" onClose={latestClose} />
    );
    expect(track.addEventListener).toHaveBeenCalledOnce();
    expect(track.removeEventListener).not.toHaveBeenCalled();
    act(() => ended());
    expect(latestClose).toHaveBeenCalledOnce();
    expect(initialClose).not.toHaveBeenCalled();
    unmount();
    expect(track.removeEventListener).toHaveBeenCalledOnce();
  });
});
