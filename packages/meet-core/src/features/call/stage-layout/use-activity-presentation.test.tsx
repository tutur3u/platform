// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useActivityPresentation } from './use-activity-presentation';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const setup = () =>
  renderHook(
    ({ sharers }: { sharers: string[] }) =>
      useActivityPresentation(true, sharers),
    { initialProps: { sharers: [] } }
  );

it('does not minimize again when a seen sharer flickers while another stays live', () => {
  const { result, rerender } = setup();
  rerender({ sharers: ['a', 'b'] });
  act(() => result.current.restore());
  rerender({ sharers: ['b'] });
  rerender({ sharers: ['a', 'b'] });
  expect(result.current.minimized).toBe(false);
});

it('keeps one share session through a brief drop by the only sharer', () => {
  vi.useFakeTimers();
  const { result, rerender } = setup();
  rerender({ sharers: ['a'] });
  act(() => result.current.restore());

  rerender({ sharers: [] });
  act(() => vi.advanceTimersByTime(1000));
  rerender({ sharers: ['a'] });
  act(() => vi.advanceTimersByTime(500));
  expect(result.current.minimized).toBe(false);

  rerender({ sharers: [] });
  act(() => vi.advanceTimersByTime(1500));
  rerender({ sharers: ['a'] });
  expect(result.current.autoMinimized).toBe(true);
});

it('preserves a manual minimize made before sharing starts', () => {
  vi.useFakeTimers();
  const { result, rerender } = setup();
  act(() => result.current.minimize());
  rerender({ sharers: ['a'] });
  rerender({ sharers: [] });
  act(() => vi.advanceTimersByTime(1500));
  expect(result.current.minimized).toBe(true);
  expect(result.current.autoMinimized).toBe(false);
});

it('minimizes again if a new sharer joins after a restore', () => {
  const { result, rerender } = setup();
  rerender({ sharers: ['a'] });
  act(() => result.current.restore());
  expect(result.current.minimized).toBe(false);
  rerender({ sharers: ['a', 'b'] });
  expect(result.current.autoMinimized).toBe(true);
});
