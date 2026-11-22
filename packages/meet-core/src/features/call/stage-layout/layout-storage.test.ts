// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  EMPTY_LAYOUT,
  MAX_PANES,
  openActivities,
  openActivity,
  type StageLayout,
} from './layout-model';
import {
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
