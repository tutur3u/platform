import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import { loadingLabels, readLoadingLabels } from './loading-labels';

describe('loading labels', () => {
  it('mirrors the meet.loading message bundles', () => {
    expect(loadingLabels.en).toEqual(en.meet.loading);
    expect(loadingLabels.vi).toEqual(vi.meet.loading);
  });

  it('selects the locale from the pathname prefix', () => {
    expect(readLoadingLabels('/vi/personal/meetings')).toBe(loadingLabels.vi);
    expect(readLoadingLabels('/personal/meetings')).toBe(loadingLabels.en);
    expect(readLoadingLabels('/en')).toBe(loadingLabels.en);
  });
});
