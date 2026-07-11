import { describe, expect, it } from 'vitest';
import { normalizeLegacyPanelSize } from './resizable';

describe('normalizeLegacyPanelSize', () => {
  it('preserves the shared wrapper numeric percentage contract', () => {
    expect(normalizeLegacyPanelSize(38)).toBe('38%');
    expect(normalizeLegacyPanelSize(0)).toBe('0%');
  });

  it('leaves explicitly unitized sizes unchanged', () => {
    expect(normalizeLegacyPanelSize('20rem')).toBe('20rem');
    expect(normalizeLegacyPanelSize('38%')).toBe('38%');
    expect(normalizeLegacyPanelSize(undefined)).toBeUndefined();
  });
});
