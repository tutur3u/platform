import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAIL_PANE_LAYOUT,
  getCurrentMailPaneLayout,
  normalizeMailPaneLayout,
  setCurrentMailPaneLayout,
} from './mail-pane-layout';

describe('normalizeMailPaneLayout', () => {
  it('accepts a usable two-pane percentage layout', () => {
    expect(normalizeMailPaneLayout([38, 62])).toEqual([38, 62]);
  });

  it('resets the narrow pixel-derived layout produced by the v4 migration', () => {
    expect(normalizeMailPaneLayout([3.925, 96.075])).toEqual(
      DEFAULT_MAIL_PANE_LAYOUT
    );
  });

  it('resets malformed or out-of-bounds persisted values', () => {
    expect(normalizeMailPaneLayout(null)).toEqual(DEFAULT_MAIL_PANE_LAYOUT);
    expect(normalizeMailPaneLayout([50])).toEqual(DEFAULT_MAIL_PANE_LAYOUT);
    expect(normalizeMailPaneLayout([70, 30])).toEqual(DEFAULT_MAIL_PANE_LAYOUT);
  });

  it('keeps the current layout available across route remounts', () => {
    setCurrentMailPaneLayout([35, 65]);

    expect(getCurrentMailPaneLayout()).toEqual([35, 65]);
  });
});
