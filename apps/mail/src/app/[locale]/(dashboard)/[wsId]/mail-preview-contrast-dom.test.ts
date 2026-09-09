// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyMailPreviewContrast } from './mail-preview-contrast';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});
describe('email border rendering', () => {
  it('softens currentColor borders after dark text becomes readable and preserves colored borders', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    document.body.innerHTML =
      '<div id="neutral" style="background:white;color:black;border:1px solid currentColor">Text</div><div id="brand" style="border:1px solid rgb(0,80,180)">Brand</div><hr style="border:1px solid white">';
    applyMailPreviewContrast(document);
    const neutral = document.getElementById('neutral')!;
    expect(getComputedStyle(neutral).color).toBe('rgb(231, 231, 231)');
    expect(getComputedStyle(neutral).borderTopColor).toBe('rgb(61, 61, 61)');
    expect(
      getComputedStyle(document.getElementById('brand')!).borderTopColor
    ).toBe('rgb(0, 80, 180)');
    expect(getComputedStyle(document.querySelector('hr')!).borderTopColor).toBe(
      'rgb(61, 61, 61)'
    );
  });
});
