import type * as monaco from 'monaco-editor';

/** Design tokens the code editor reads; every entry is a CSS custom property name without `--`. */
export const EDITOR_THEME_TOKENS = [
  'card',
  'foreground',
  'muted',
  'muted-foreground',
  'border',
  'primary',
  'accent',
  'ring',
  'destructive',
  'purple',
  'green',
  'orange',
  'blue',
  'cyan',
] as const;
export type EditorThemeToken = (typeof EDITOR_THEME_TOKENS)[number];
export type EditorThemeColors = Record<EditorThemeToken, string>;

export const EDITOR_THEME_NAME = 'tuturuuu-code';

/** Used only when the page exposes no readable token, e.g. in tests or a bare embed. */
export const FALLBACK_EDITOR_COLORS: Record<
  'light' | 'dark',
  EditorThemeColors
> = {
  light: {
    card: '#ffffff',
    foreground: '#26212b',
    muted: '#fff1ee',
    'muted-foreground': '#6b6170',
    border: '#f0e1dd',
    primary: '#26212b',
    accent: '#ffe9e4',
    ring: '#2a55a8',
    destructive: '#a8302e',
    purple: '#7b3fa0',
    green: '#2f7d4f',
    orange: '#b0521c',
    blue: '#2a55a8',
    cyan: '#1f7a7a',
  },
  dark: {
    card: '#211d26',
    foreground: '#f6eff4',
    muted: '#2a2530',
    'muted-foreground': '#b3a8b5',
    border: '#3a3241',
    primary: '#f6eff4',
    accent: '#2f2935',
    ring: '#b5cdff',
    destructive: '#ffb3ae',
    purple: '#d7b5ff',
    green: '#9fe0b5',
    orange: '#ffc29a',
    blue: '#b5cdff',
    cyan: '#9fe3e3',
  },
};

const HEX = /^#[0-9a-f]{6}$/;

export function rgbToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue]
    .map((part) =>
      Math.max(0, Math.min(255, Math.round(part)))
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;
}

/** Appends an alpha channel to a `#rrggbb` color, the form Monaco theme colors accept. */
export function withAlpha(hex: string, alpha: number) {
  const value = Math.max(0, Math.min(255, Math.round(alpha * 255)));
  return `${hex}${value.toString(16).padStart(2, '0')}`;
}

/**
 * Merges resolved token colors over the fallback palette. A token that did not
 * resolve to `#rrggbb` keeps its fallback, so a missing variable never yields
 * an invalid Monaco theme.
 */
export function editorColors(
  resolved: Partial<Record<EditorThemeToken, string | null>>,
  dark: boolean
): EditorThemeColors {
  const fallback = FALLBACK_EDITOR_COLORS[dark ? 'dark' : 'light'];
  const colors = { ...fallback };
  for (const token of EDITOR_THEME_TOKENS) {
    const value = resolved[token]?.toLowerCase();
    if (value && HEX.test(value)) colors[token] = value;
  }
  return colors;
}

const bare = (hex: string) => hex.slice(1);

/** The editor surface, gutter and syntax palette all come from the app's tokens. */
export function buildEditorTheme(
  colors: EditorThemeColors,
  dark: boolean
): monaco.editor.IStandaloneThemeData {
  return {
    base: dark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [
      { token: '', foreground: bare(colors.foreground) },
      {
        token: 'comment',
        foreground: bare(colors['muted-foreground']),
        fontStyle: 'italic',
      },
      { token: 'keyword', foreground: bare(colors.purple) },
      { token: 'storage', foreground: bare(colors.purple) },
      { token: 'string', foreground: bare(colors.green) },
      { token: 'regexp', foreground: bare(colors.cyan) },
      { token: 'number', foreground: bare(colors.orange) },
      { token: 'constant', foreground: bare(colors.orange) },
      { token: 'type', foreground: bare(colors.blue) },
      { token: 'type.identifier', foreground: bare(colors.blue) },
      { token: 'function', foreground: bare(colors.blue) },
      { token: 'tag', foreground: bare(colors.blue) },
      { token: 'attribute.name', foreground: bare(colors.orange) },
      { token: 'delimiter', foreground: bare(colors['muted-foreground']) },
      { token: 'invalid', foreground: bare(colors.destructive) },
    ],
    colors: {
      'editor.background': colors.card,
      'editor.foreground': colors.foreground,
      'editorGutter.background': colors.card,
      'editorLineNumber.foreground': withAlpha(colors['muted-foreground'], 0.7),
      'editorLineNumber.activeForeground': colors.foreground,
      'editorCursor.foreground': colors.ring,
      'editor.lineHighlightBackground': withAlpha(colors.accent, 0.55),
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': withAlpha(colors.ring, dark ? 0.32 : 0.22),
      'editor.inactiveSelectionBackground': withAlpha(colors.ring, 0.14),
      'editor.wordHighlightBackground': withAlpha(colors.ring, 0.12),
      'editorIndentGuide.background1': withAlpha(colors.border, 0.9),
      'editorIndentGuide.activeBackground1': colors['muted-foreground'],
      'editorWhitespace.foreground': withAlpha(colors['muted-foreground'], 0.4),
      'editorWidget.background': colors.card,
      'editorWidget.border': colors.border,
      'editorSuggestWidget.background': colors.card,
      'editorSuggestWidget.border': colors.border,
      'editorSuggestWidget.selectedBackground': colors.accent,
      'editorHoverWidget.background': colors.card,
      'editorHoverWidget.border': colors.border,
      'scrollbarSlider.background': withAlpha(colors['muted-foreground'], 0.22),
      'scrollbarSlider.hoverBackground': withAlpha(
        colors['muted-foreground'],
        0.36
      ),
      'scrollbarSlider.activeBackground': withAlpha(
        colors['muted-foreground'],
        0.5
      ),
      focusBorder: '#00000000',
    },
  };
}
