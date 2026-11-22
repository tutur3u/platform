import { describe, expect, it } from 'vitest';
import {
  buildEditorTheme,
  editorColors,
  FALLBACK_EDITOR_COLORS,
  rgbToHex,
  withAlpha,
} from './editor-theme';

describe('editor theme', () => {
  it('formats resolved channels and alpha the way Monaco expects', () => {
    expect(rgbToHex(255, 251, 250)).toBe('#fffbfa');
    expect(rgbToHex(-4, 300, 9.6)).toBe('#00ff0a');
    expect(withAlpha('#2a55a8', 0.5)).toBe('#2a55a880');
  });

  it('keeps the fallback for tokens that did not resolve to #rrggbb', () => {
    const colors = editorColors(
      { card: '#211D26', foreground: 'hsl(0 0% 98%)', purple: null },
      true
    );
    expect(colors.card).toBe('#211d26');
    expect(colors.foreground).toBe(FALLBACK_EDITOR_COLORS.dark.foreground);
    expect(colors.purple).toBe(FALLBACK_EDITOR_COLORS.dark.purple);
  });

  it('paints the editor surface, gutter and syntax from the tokens', () => {
    const colors = { ...FALLBACK_EDITOR_COLORS.light, card: '#fdf9f7' };
    const theme = buildEditorTheme(colors, false);
    expect(theme.base).toBe('vs');
    expect(theme.colors['editor.background']).toBe('#fdf9f7');
    expect(theme.colors['editorGutter.background']).toBe('#fdf9f7');
    expect(theme.colors['editorLineNumber.foreground']).toBe(
      withAlpha(colors['muted-foreground'], 0.7)
    );
    expect(theme.rules).toContainEqual({
      token: 'keyword',
      foreground: colors.purple.slice(1),
    });
    expect(buildEditorTheme(FALLBACK_EDITOR_COLORS.dark, true).base).toBe(
      'vs-dark'
    );
  });
});
