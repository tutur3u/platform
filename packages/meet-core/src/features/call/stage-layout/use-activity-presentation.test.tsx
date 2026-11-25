// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useActivityPresentation } from './use-activity-presentation';

afterEach(cleanup);

const setup = () =>
  renderHook(
    ({ sharers }: { sharers: string[] }) => useActivityPresentation(true, sharers),
    { initialProps: { sharers: [] } }
  );

it('does not minimize again when a seen sharer flickers while another stays live', () => {
  const { result, rerender } = setup();
  rerender({ sharers: ['a', 'b'] });
  act(() => result.current.restore());
  rerender({ sharers: ['b'] });
  rerender({ sharers: ['a', 'b'] });
  expect(result.current.minimized).toBe(false);
  rerender({ sharers: [] });
  rerender({ sharers: ['a'] });
  expect(result.current.autoMinimized).toBe(true);
});

it('preserves a manual minimize made before sharing starts', () => {
  const { result, rerender } = setup();
  act(() => result.current.minimize());
  rerender({ sharers: ['a'] });
  act(() => result.current.restoreAutoMinimized());
  rerender({ sharers: [] });
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
