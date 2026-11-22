// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { stageLayoutKey } from './layout-storage';
import { tierForWidth, useStageLayout } from './use-stage-layout';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
});

const available = () => true;
const mount = (options: Partial<Parameters<typeof useStageLayout>[0]> = {}) =>
  renderHook(() =>
    useStageLayout({
      accountId: 'u1',
      meetingId: 'm1',
      isAvailable: available,
      tier: 'desktop',
      ...options,
    })
  );
const flush = () => act(() => void vi.advanceTimersByTime(300));

it('maps viewport widths to tiers: panes only from tablet width', () => {
  expect(tierForWidth(390)).toBe('phone');
  expect(tierForWidth(767)).toBe('phone');
  expect(tierForWidth(768)).toBe('tablet');
  expect(tierForWidth(1023)).toBe('tablet');
  expect(tierForWidth(1024)).toBe('desktop');
});

it('opens, toggles and closes activities and reports what is open', () => {
  const { result } = mount();
  act(() => {
    result.current.open('a');
    result.current.open('b');
  });
  expect(result.current.openIds).toEqual(['a', 'b']);
  expect(result.current.focused).toBe('b');
  act(() => result.current.toggle('a'));
  expect(result.current.isOpen('a')).toBe(false);
  act(() => result.current.close('b'));
  expect(result.current.openIds).toEqual([]);
});

it('remembers the layout per room and restores it after a reconnect remount', () => {
  const first = mount();
  act(() => {
    first.result.current.open('a');
    first.result.current.open('b');
  });
  act(() =>
    first.result.current.maximize(first.result.current.layout.focusedPaneId)
  );
  flush();
  expect(localStorage.getItem(stageLayoutKey('u1', 'm1'))).toContain('"a"');
  first.unmount();
  // The room reconnects and its shell mounts again.
  const again = mount();
  expect(again.result.current.openIds).toEqual(['a', 'b']);
  expect(again.result.current.layout.maximizedPaneId).not.toBeNull();
  again.unmount();
  // Another room, and another person, start clean.
  expect(mount({ meetingId: 'm2' }).result.current.openIds).toEqual([]);
  expect(mount({ accountId: 'u2' }).result.current.openIds).toEqual([]);
});

it('writes the pending layout when the room unmounts before the delay', () => {
  const { result, unmount } = mount();
  act(() => result.current.open('a'));
  unmount();
  expect(localStorage.getItem(stageLayoutKey('u1', 'm1'))).toContain('"a"');
});

it('fits a saved layout to a narrower viewport without rewriting it', () => {
  const wide = mount();
  act(() => {
    wide.result.current.open('a');
    wide.result.current.open('b');
    wide.result.current.open('c');
  });
  flush();
  wide.unmount();
  const tablet = mount({ tier: 'tablet' });
  expect(tablet.result.current.layout.root).not.toBeNull();
  expect(tablet.result.current.openIds).toEqual(['a', 'b', 'c']);
  const phone = mount({ tier: 'phone' });
  expect(phone.result.current.openIds).toEqual(['a', 'b', 'c']);
  expect(phone.result.current.maxPanes).toBe(1);
  phone.unmount();
  expect(mount().result.current.openIds).toEqual(['a', 'b', 'c']);
});

it('hides activities that are unavailable and brings them back when they return', () => {
  let allowed = true;
  const { result, rerender } = renderHook(() =>
    useStageLayout({
      accountId: 'u1',
      meetingId: 'm1',
      tier: 'desktop',
      isAvailable: allowed ? available : (id) => id !== 'a',
    })
  );
  act(() => {
    result.current.open('a');
    result.current.open('b');
  });
  allowed = false;
  rerender();
  expect(result.current.openIds).toEqual(['b']);
  allowed = true;
  rerender();
  expect(result.current.openIds).toEqual(['a', 'b']);
});

it('stores a video strip preference apart from the panes', () => {
  const { result } = mount();
  act(() => result.current.setStrip('pill'));
  flush();
  expect(mount().result.current.strip).toBe('pill');
});
