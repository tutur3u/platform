'use client';
import { type RefObject, useEffect, useMemo, useState } from 'react';
import {
  buildEditorTheme,
  EDITOR_THEME_TOKENS,
  type EditorThemeColors,
  type EditorThemeToken,
  editorColors,
  FALLBACK_EDITOR_COLORS,
  rgbToHex,
} from './editor-theme';
import { useDarkSurface } from './use-dark-surface';

type Paint = Pick<
  CanvasRenderingContext2D,
  'fillStyle' | 'clearRect' | 'fillRect' | 'getImageData'
>;

/**
 * Resolves any CSS color the browser understands (hex, hsl, oklch, color-mix)
 * to `#rrggbb` by painting one pixel. An unparseable value leaves the canvas
 * fill unchanged, which two different sentinels detect.
 */
export function cssColorToHex(value: string, paint: Paint): string | null {
  const candidates = [value.trim()];
  // Older token sheets store bare HSL channels such as `0 0% 98%`.
  if (/^[\d.]+\s+[\d.]+%\s+[\d.]+%$/.test(candidates[0]!))
    candidates.push(`hsl(${candidates[0]})`);
  for (const candidate of candidates) {
    if (!candidate) continue;
    paint.fillStyle = '#000001';
    paint.fillStyle = candidate;
    const first = paint.fillStyle;
    paint.fillStyle = '#000002';
    paint.fillStyle = candidate;
    if (first === '#000001' && paint.fillStyle === '#000002') continue;
    paint.clearRect(0, 0, 1, 1);
    paint.fillRect(0, 0, 1, 1);
    const [red = 0, green = 0, blue = 0] = paint.getImageData(0, 0, 1, 1).data;
    return rgbToHex(red, green, blue);
  }
  return null;
}

function luminance(hex: string) {
  const [red, green, blue] = [1, 3, 5].map(
    (start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255
  );
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
}

export function readEditorColors(
  element: Element,
  darkHint: boolean
): { colors: EditorThemeColors; dark: boolean } {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const paint = canvas.getContext('2d', { willReadFrequently: true });
  if (!paint)
    return {
      colors: FALLBACK_EDITOR_COLORS[darkHint ? 'dark' : 'light'],
      dark: darkHint,
    };
  const style = getComputedStyle(element);
  const resolved: Partial<Record<EditorThemeToken, string | null>> = {};
  for (const token of EDITOR_THEME_TOKENS) {
    const raw = style.getPropertyValue(`--${token}`);
    resolved[token] = raw.trim() ? cssColorToHex(raw, paint) : null;
  }
  const dark = resolved.card ? luminance(resolved.card) < 0.4 : darkHint;
  return { colors: editorColors(resolved, dark), dark };
}

const sameColors = (a: EditorThemeColors, b: EditorThemeColors) =>
  EDITOR_THEME_TOKENS.every((token) => a[token] === b[token]);

/**
 * The Monaco theme for the element's current design tokens. It re-reads the
 * tokens whenever the document's theme attributes change (light/dark, Sorbet
 * presets), so the editor never keeps a stale surface.
 */
export function useEditorTheme(host: RefObject<HTMLElement | null>) {
  const darkHint = useDarkSurface();
  const [state, setState] = useState(() => ({
    colors: FALLBACK_EDITOR_COLORS[darkHint ? 'dark' : 'light'],
    dark: darkHint,
  }));
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const read = () => {
      const next = readEditorColors(
        host.current ?? document.documentElement,
        darkHint
      );
      setState((current) =>
        current.dark === next.dark && sameColors(current.colors, next.colors)
          ? current
          : next
      );
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true });
    if (document.body) observer.observe(document.body, { attributes: true });
    return () => observer.disconnect();
  }, [host, darkHint]);
  return useMemo(
    () => buildEditorTheme(state.colors, state.dark),
    [state.colors, state.dark]
  );
}
