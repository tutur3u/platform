import type { EditorLocale, EditorMessages } from './types.js';

export const editorMessages: Record<EditorLocale, EditorMessages> = {
  en: {
    blockquote: 'Quote',
    bold: 'Bold',
    bulletList: 'Bulleted list',
    heading: 'Heading',
    horizontalRule: 'Divider',
    image: 'Image',
    italic: 'Italic',
    link: 'Link',
    orderedList: 'Numbered list',
    placeholder: 'Write something…',
    redo: 'Redo',
    undo: 'Undo',
    words: (count) => `${count} ${count === 1 ? 'word' : 'words'}`,
  },
  vi: {
    blockquote: 'Trích dẫn',
    bold: 'In đậm',
    bulletList: 'Danh sách dấu đầu dòng',
    heading: 'Tiêu đề',
    horizontalRule: 'Đường phân cách',
    image: 'Hình ảnh',
    italic: 'In nghiêng',
    link: 'Liên kết',
    orderedList: 'Danh sách đánh số',
    placeholder: 'Bắt đầu viết…',
    redo: 'Làm lại',
    undo: 'Hoàn tác',
    words: (count) => `${count} từ`,
  },
};
