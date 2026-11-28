export type RichTextNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: RichTextMark[];
  content?: RichTextNode[];
};

export type RichTextMark = {
  type: string;
  attrs?: Record<string, unknown>;
};
