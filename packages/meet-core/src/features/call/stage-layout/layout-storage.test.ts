// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EMPTY_LAYOUT,
  MAX_PANES,
  openActivities,
  openActivity,
  type StageLayout,
} from './layout-model';
import {
  MAX_STORED_ROOMS,
  normalizeSizes,
  parseStageLayout,
  readStoredStage,
  stageLayoutKey,
  writeStoredStage,
} from './layout-storage';

afterEach(() => localStorage.clear());

const layout = ['a', 'b', 'c', 'd'].reduce(
  (next, id) => openActivity(next, id, { maxPanes: MAX_PANES.desktop }),
  EMPTY_LAYOUT
);

describe('stage layout storage', () => {
  it('keeps a key per person and room', () => {
    expect(stageLayoutKey('u1', 'm1')).not.toBe(stageLayoutKey('u1', 'm2'));
    expect(stageLayoutKey('u1', 'm1')).not.toBe(stageLayoutKey('u2', 'm1'));
  });

  it('round-trips a layout and the video strip preference', () => {
    const key = stageLayoutKey('u1', 'm1');
    writeStoredStage(key, { layout, views: {}, strip: 'pill' });
    const read = readStoredStage(key);
    expect(read.layout).toEqual(layout);
    expect(read.strip).toBe('pill');
    // Another room starts empty.
    expect(readStoredStage(stageLayoutKey('u1', 'm2')).layout.root).toBeNull();
  });

  it('removes an empty default so nothing lingers', () => {
    const key = stageLayoutKey('u1', 'm1');
    writeStoredStage(key, { layout, views: {}, strip: 'auto' });
    writeStoredStage(key, { layout: EMPTY_LAYOUT, views: {}, strip: 'auto' });
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('survives damaged or hostile values', () => {
    const key = stageLayoutKey('u1', 'm1');
    for (const value of [
      'not json',
      '{}',
      '{"layout":{"root":{"kind":"pane","id":"p1","tabs":[]}}}',
      JSON.stringify({
        layout: {
          root: {
            kind: 'split',
            id: 's1',
            axis: 'diag',
            children: [],
            sizes: [],
          },
        },
      }),
    ]) {
      localStorage.setItem(key, value);
      expect(readStoredStage(key).layout.root).toBeNull();
    }
  });

  it('rejects more panes than any viewport shows and repeated activities', () => {
    const pane = (id: string, tab: string) => ({
      kind: 'pane',
      id,
      tabs: [tab, 'dup'],
      active: tab,
    });
    const parsed = parseStageLayout({
      layout: {
        root: {
          kind: 'split',
          id: 's1',
          axis: 'row',
          sizes: [50, 50],
          children: [pane('p1', 'a'), pane('p2', 'b')],
        },
      },
    });
    const tabs = JSON.stringify(parsed.root);
    expect(tabs.match(/"dup"/g)).toHaveLength(1);
    expect(parsed.nextId).toBeGreaterThan(2);
    const four = parseStageLayout({
      layout: {
        root: {
          kind: 'split',
          id: 's9',
          axis: 'row',
          sizes: [25, 25, 25, 25],
          children: ['1', '2', '3', '4'].map((n) => pane(`p${n}`, `t${n}`)),
        },
      },
    });
    expect(four.root).toBeNull();
  });
});

describe('narrow screen arrangements', () => {
  it('round-trips a tablet arrangement and aligns it with the desktop activities', () => {
    const key = stageLayoutKey('u1', 'm1');
    const tablet = ['a', 'b'].reduce(
      (next, id) => openActivity(next, id, { maxPanes: MAX_PANES.tablet }),
      EMPTY_LAYOUT
    );
    writeStoredStage(key, { layout, views: { tablet }, strip: 'auto' });
    expect(readStoredStage(key).views.tablet?.root).not.toBeNull();
    // Views that fall out of step with the desktop activities are aligned.
    const matching = ['a', 'b', 'c', 'd'].reduce(
      (next, id) => openActivity(next, id, { maxPanes: MAX_PANES.tablet }),
      EMPTY_LAYOUT
    );
    const old = openActivity(matching, 'gone', { maxPanes: 2 });
    writeStoredStage(key, { layout, views: { tablet: old }, strip: 'auto' });
    const read = readStoredStage(key).views.tablet;
    expect(openActivities(read as StageLayout).sort()).toEqual(
      openActivities(layout).sort()
    );
  });

  it('drops a narrow arrangement with more panes than its screen shows', () => {
    const key = stageLayoutKey('u1', 'm1');
    writeStoredStage(key, { layout, views: { phone: layout }, strip: 'auto' });
    expect(readStoredStage(key).views.phone).toBeUndefined();
  });
});

describe('stored sizes and the room cap', () => {
  const pane = (id: string, tab: string) => ({
    kind: 'pane',
    id,
    tabs: [tab],
    active: tab,
  });
  const split = (sizes: number[]) => ({
    layout: {
      root: {
        kind: 'split',
        id: 's1',
        axis: 'row',
        sizes,
        children: sizes.map((_, index) => pane(`p${index + 1}`, `t${index}`)),
      },
    },
  });

  it('scales sizes to sum to 100 when parsing', () => {
    const root = parseStageLayout(split([1, 3])).root;
    expect(root?.kind === 'split' && root.sizes).toEqual([25, 75]);
    const three = parseStageLayout(split([1, 1, 1])).root;
    expect(
      three?.kind === 'split' &&
        Math.round(three.sizes.reduce((a, b) => a + b, 0) * 100) / 100
    ).toBe(100);
  });

  it('falls back to equal shares when a pane would be squeezed away', () => {
    const root = parseStageLayout(split([1000, 1])).root;
    expect(root?.kind === 'split' && root.sizes).toEqual([50, 50]);
    expect(normalizeSizes([30, 30, 40])).toEqual([30, 30, 40]);
  });

  it('keeps only the most recently used rooms', () => {
    let clock = 1_000;
    const now = vi.spyOn(Date, 'now').mockImplementation(() => clock++);
    for (let room = 0; room < MAX_STORED_ROOMS + 5; room++)
      writeStoredStage(stageLayoutKey('u1', `room-${room}`), {
        layout,
        views: {},
        strip: 'auto',
      });
    now.mockRestore();
    const kept = Object.keys(localStorage).filter((key) =>
      key.includes(':u1:room-')
    );
    expect(kept).toHaveLength(MAX_STORED_ROOMS);
    expect(localStorage.getItem(stageLayoutKey('u1', 'room-0'))).toBeNull();
    expect(
      localStorage.getItem(stageLayoutKey('u1', `room-${MAX_STORED_ROOMS + 4}`))
    ).not.toBeNull();
  });
});
