export type JSONContent = {
  attrs?: Record<string, unknown>;
  content?: JSONContent[];
  marks?: Array<{ attrs?: Record<string, unknown>; type: string }>;
  text?: string;
  type?: string;
};

export type EditorLocale = 'en' | 'vi';

export type EditorMessages = {
  blockquote: string;
  bold: string;
  bulletList: string;
  heading: string;
  horizontalRule: string;
  image: string;
  italic: string;
  link: string;
  orderedList: string;
  placeholder: string;
  redo: string;
  toolbar: string;
  undo: string;
  words: (count: number) => string;
};
