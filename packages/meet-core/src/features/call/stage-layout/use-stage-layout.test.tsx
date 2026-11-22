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

it('keeps the desktop split when arranging panes on a narrow screen', () => {
  const desktop = mount();
  act(() => {
    desktop.result.current.open('a');
    desktop.result.current.open('b');
    desktop.result.current.open('c');
  });
  const split = JSON.stringify(desktop.result.current.layout.root);
  flush();
  desktop.unmount();

  const tablet = mount({ tier: 'tablet' });
  // Reorder, resize and maximize on the tablet.
  act(() =>
    tablet.result.current.movePane(
      tablet.result.current.layout.focusedPaneId ?? '',
      -1
    )
  );
  const tabletRoot = tablet.result.current.layout.root;
  const boundary = tabletRoot?.kind === 'split' ? tabletRoot : null;
  act(() => tablet.result.current.resize(boundary?.id ?? '', 0, 70));
  act(() =>
    tablet.result.current.maximize(tablet.result.current.layout.focusedPaneId)
  );
  flush();
  tablet.unmount();

  const again = mount();
  expect(JSON.stringify(again.result.current.layout.root)).toBe(split);
  expect(again.result.current.layout.maximizedPaneId).toBeNull();
  again.unmount();
  // The tablet keeps the arrangement made there.
  const back = mount({ tier: 'tablet' });
  expect(back.result.current.layout.maximizedPaneId).not.toBeNull();
});

it('applies opening and closing to every arrangement', () => {
  const desktop = mount();
  act(() => desktop.result.current.open('a'));
  act(() => desktop.result.current.open('b'));
  flush();
  desktop.unmount();
  const tablet = mount({ tier: 'tablet' });
  act(() =>
    tablet.result.current.maximize(tablet.result.current.layout.focusedPaneId)
  );
  act(() => tablet.result.current.open('c'));
  act(() => tablet.result.current.close('a'));
  expect(tablet.result.current.openIds.sort()).toEqual(['b', 'c']);
  flush();
  tablet.unmount();
  const wide = mount();
  expect(wide.result.current.openIds.sort()).toEqual(['b', 'c']);
  wide.unmount();
  // A phone with no arrangement of its own shows the same activities.
  const phone = mount({ tier: 'phone' });
  expect(phone.result.current.openIds.sort()).toEqual(['b', 'c']);
  act(() => phone.result.current.close('b'));
  flush();
  phone.unmount();
  expect(mount({ tier: 'tablet' }).result.current.openIds).toEqual(['c']);
  expect(mount().result.current.openIds).toEqual(['c']);
});

it('restores the desktop pane count and sizes after arranging on a narrow screen', () => {
  const desktop = mount();
  act(() => {
    desktop.result.current.open('a');
    desktop.result.current.open('b');
    desktop.result.current.open('c');
  });
  const root = desktop.result.current.layout.root;
  act(() =>
    desktop.result.current.resize(root?.kind === 'split' ? root.id : '', 0, 70)
  );
  const sizes = (layout: typeof desktop.result.current.layout) =>
    JSON.stringify(layout.root?.kind === 'split' ? layout.root.sizes : null);
  const before = sizes(desktop.result.current.layout);
  expect(before).toBe('[70,30]');
  flush();
  desktop.unmount();

  const phone = mount({ tier: 'phone' });
  expect(phone.result.current.openIds).toEqual(['a', 'b', 'c']);
  act(() =>
    phone.result.current.activate(
      phone.result.current.layout.focusedPaneId ?? '',
      'a'
    )
  );
  act(() => phone.result.current.maximize(null));
  flush();
  phone.unmount();

  const wide = mount();
  expect(wide.result.current.layout.root?.kind).toBe('split');
  expect(sizes(wide.result.current.layout)).toBe(before);
  expect(wide.result.current.openIds).toEqual(['a', 'b', 'c']);
});

it('keeps an unavailable activity through edits and returns it with its pane', () => {
  let blocked: string[] = [];
  const { result, rerender, unmount } = renderHook(() =>
    useStageLayout({
      accountId: 'u1',
      meetingId: 'm1',
      tier: 'desktop',
      isAvailable: blocked.length ? (id) => !blocked.includes(id) : available,
    })
  );
  act(() => {
    result.current.open('a');
    result.current.open('b');
    result.current.open('c');
  });
  const paneOfB = result.current.layout.root;
  expect(paneOfB).not.toBeNull();
  // A role change hides b and c while the person keeps working.
  blocked = ['b', 'c'];
  rerender();
  expect(result.current.openIds).toEqual(['a']);
  act(() => result.current.open('d'));
  act(() => result.current.close('a'));
  act(() => result.current.maximize(result.current.layout.focusedPaneId));
  expect(result.current.openIds).toEqual(['d']);
  flush();
  unmount();
  // Reloading while still unavailable shows only what may be shown.
  blocked = ['b', 'c'];
  const reloaded = renderHook(() =>
    useStageLayout({
      accountId: 'u1',
      meetingId: 'm1',
      tier: 'desktop',
      isAvailable: (id) => !blocked.includes(id),
    })
  );
  expect(reloaded.result.current.openIds).toEqual(['d']);
  // Access returns: b and c are back.
  blocked = [];
  reloaded.rerender();
  expect(reloaded.result.current.openIds.sort()).toEqual(['b', 'c', 'd']);
});

it('reads the layout of another room when the room changes', () => {
  const first = mount({ meetingId: 'm1' });
  act(() => first.result.current.open('a'));
  flush();
  first.unmount();
  let meetingId = 'm1';
  const { result, rerender } = renderHook(() =>
    useStageLayout({
      accountId: 'u1',
      meetingId,
      isAvailable: available,
      tier: 'desktop',
    })
  );
  expect(result.current.openIds).toEqual(['a']);
  meetingId = 'm2';
  rerender();
  expect(result.current.openIds).toEqual([]);
  act(() => result.current.open('z'));
  meetingId = 'm1';
  rerender();
  expect(result.current.openIds).toEqual(['a']);
  meetingId = 'm2';
  rerender();
  expect(result.current.openIds).toEqual(['z']);
});

it('stores nothing for an edit that changes nothing', () => {
  const { result } = mount();
  act(() => result.current.open('a'));
  flush();
  const write = vi.spyOn(Storage.prototype, 'setItem');
  const pane = result.current.layout.focusedPaneId ?? '';
  act(() => result.current.focusPane(pane));
  act(() => result.current.activate(pane, 'a'));
  act(() => result.current.maximize(null));
  act(() => result.current.open('a'));
  flush();
  expect(write).not.toHaveBeenCalled();
  write.mockRestore();
});

it('does not fork a narrow arrangement for a focus or tab switch', () => {
  const desktop = mount();
  act(() => {
    desktop.result.current.open('a');
    desktop.result.current.open('b');
    desktop.result.current.open('c');
  });
  flush();
  desktop.unmount();
  const key = stageLayoutKey('u1', 'm1');
  const savedViews = () => JSON.parse(localStorage.getItem(key) ?? '{}').views;

  const tablet = mount({ tier: 'tablet' });
  // On the tablet b and c share a pane; bring b forward, then focus the first.
  const panes = () => tablet.result.current.layout;
  const shared = panes().focusedPaneId ?? '';
  act(() => tablet.result.current.activate(shared, 'b'));
  expect(tablet.result.current.focused).toBe('b');
  const first = JSON.stringify(panes().root).includes('"a"') ? 'a' : '';
  expect(first).toBe('a');
  act(() =>
    tablet.result.current.focusPane(
      (panes().root?.kind === 'split' ? panes().root.children[0]?.id : '') ?? ''
    )
  );
  expect(tablet.result.current.focused).toBe('a');
  flush();
  expect(savedViews()).toEqual({});
  tablet.unmount();
  // The desktop arrangement carries the focus the person moved there.
  const wide = mount();
  expect(wide.result.current.focused).toBe('a');
  expect(wide.result.current.openIds).toEqual(['a', 'b', 'c']);
});
