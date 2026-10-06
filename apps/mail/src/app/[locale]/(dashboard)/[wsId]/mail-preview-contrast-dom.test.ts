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

describe('calendar invitation paper contrast', () => {
  it('corrects pale sender text on original white paper without flattening it', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    document.body.innerHTML =
      '<table style="background:white"><tbody><tr><td style="color:rgb(231,231,231)"><strong>When</strong><a href="https://calendar.google.com" style="color:rgb(180,190,210)">Respond</a></td></tr></tbody></table>';
    applyMailPreviewContrast(document, null, 'original');
    expect(
      getComputedStyle(document.querySelector('table')!).backgroundColor
    ).toBe('rgb(255, 255, 255)');
    expect(getComputedStyle(document.querySelector('td')!).color).toBe(
      'rgb(23, 23, 23)'
    );
    expect(getComputedStyle(document.querySelector('a')!).color).toBe(
      'rgb(23, 23, 23)'
    );
  });
});
