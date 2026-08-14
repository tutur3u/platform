import { formatForDisplay } from '@tanstack/react-hotkeys';

const HOTKEYS = {
  'heading-1': 'Mod+Alt+1',
  'heading-2': 'Mod+Alt+2',
  'heading-3': 'Mod+Alt+3',
  bold: 'Mod+B',
  italic: 'Mod+I',
  strike: 'Mod+Shift+S',
  subscript: 'Mod+,',
  superscript: 'Mod+.',
  'align-left': 'Mod+Shift+L',
  'align-center': 'Mod+Shift+E',
  'align-right': 'Mod+Shift+R',
  'bullet-list': 'Mod+Shift+8',
  'ordered-list': 'Mod+Shift+7',
  'task-list': 'Mod+Shift+9',
  'toggle-block': '',
  table: '',
  link: 'Mod+K',
  image: '',
  video: '',
  youtube: '',
  'convert-to-task': '',
} as const;

export const TOOLBAR_LABELS: Record<string, string> = {
  'heading-1': 'Heading 1',
  'heading-2': 'Heading 2',
  'heading-3': 'Heading 3',
  bold: 'Bold',
  italic: 'Italic',
  strike: 'Strikethrough',
  subscript: 'Subscript',
  superscript: 'Superscript',
  'align-left': 'Align Left',
  'align-center': 'Align Center',
  'align-right': 'Align Right',
  'bullet-list': 'Bullet List',
  'ordered-list': 'Ordered List',
  'task-list': 'Task List',
  'toggle-block': 'Toggle List or Heading',
  table: 'Insert Table',
  link: 'Link',
  image: 'Upload Image',
  video: 'Upload Video',
  youtube: 'YouTube Video',
  'convert-to-task': 'Convert to Task',
};

export const TOOLBAR_GROUPS = [
  ['heading-1', 'heading-2', 'heading-3'],
  ['bold', 'italic', 'strike', 'subscript', 'superscript'],
  ['align-left', 'align-center', 'align-right'],
  ['bullet-list', 'ordered-list', 'task-list', 'toggle-block'],
  ['table', 'link'],
] as const;

export function hotkeyLabel(key: string): string {
  const combo = HOTKEYS[key as keyof typeof HOTKEYS];
  if (!combo) return '';
  try {
    return formatForDisplay(combo);
  } catch {
    return combo;
  }
}
