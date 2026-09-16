import { act, fireEvent, render, screen } from '@testing-library/react';
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

it.each(['screen', 'webcam'] as const)(
  'keeps %s compact with an expandable preview and a stop control',
  (type) => {
    const track = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const stream = { getVideoTracks: () => [track] } as unknown as MediaStream;
    const onClose = vi.fn();
    const { container, unmount } = render(
      <VideoPreview compact stream={stream} type={type} onClose={onClose} />
    );
    const thumbnail = container.querySelector('video')!;
    expect(container.querySelectorAll('video')).toHaveLength(1);
    expect(thumbnail.srcObject).toBe(stream);
    expect(thumbnail.style.transform).toBe(
      type === 'webcam' ? 'scaleX(-1)' : ''
    );
    fireEvent.click(screen.getByRole('button', { name: 'expand_preview' }));
    const expanded = screen.getByRole('dialog').querySelector('video')!;
    expect(expanded.srcObject).toBe(stream);
    expect(onClose).not.toHaveBeenCalled();
    unmount();
    expect(thumbnail.srcObject).toBeNull();
    expect(expanded.srcObject).toBeNull();
    expect(track.removeEventListener).toHaveBeenCalledOnce();
  }
);
