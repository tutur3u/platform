export type JSONContent = {
  attrs?: Record<string, unknown>;
  content?: JSONContent[];
  marks?: Array<{ attrs?: Record<string, unknown>; type: string }>;
  text?: string;
  type?: string;
};

export type EditorLocale = 'en' | 'vi';

export type RichTextFeaturePreset = 'compact' | 'full';

export type RichTextAlignment = 'center' | 'left' | 'right';

export type RichTextStyleOption = {
  label: string;
  value: string;
};

export type RichTextStylePolicy = {
  alignments?: readonly RichTextAlignment[];
  highlights?: readonly RichTextStyleOption[];
  textTones?: readonly RichTextStyleOption[];
};

export type EditorMessages = {
  alignCenter: string;
  alignLeft: string;
  alignRight: string;
  applyHTML: string;
  applyLink: string;
  blockquote: string;
  bold: string;
  bulletList: string;
  cancel: string;
  clearHighlight: string;
  clearTextTone: string;
  collapsible: string;
  collapsiblePlaceholder: string;
  collapsibleTitle: string;
  discardHTML: string;
  editor?: string;
  heading: string;
  heading1?: string;
  heading2?: string;
  heading3?: string;
  heading4?: string;
  highlight: string;
  html: string;
  htmlChangesPending: string;
  htmlNormalized: string;
  htmlSource: string;
  htmlSourceHelp: string;
  horizontalRule: string;
  image: string;
  invalidLink: string;
  italic: string;
  link: string;
  linkPlaceholder: string;
  mode?: string;
  orderedList: string;
  placeholder: string;
  preview?: string;
  redo: string;
  sourceUnsafe: string;
  strikethrough: string;
  textTone: string;
  toolbar: string;
  undo: string;
  underline: string;
  /** @deprecated Use `editor` for the authoring mode label. */
  visual: string;
  words: (count: number) => string;
};
