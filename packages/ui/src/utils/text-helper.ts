import type { JSONContent } from '@tiptap/core';

export const removeAccents = (str: string) =>
  str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // specifically replace "đ" with "d" (both lowercase and uppercase)
    // to support Vietnamese characters
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');

export const getDescriptionText = (description?: string): string => {
  if (!description) return '';

  try {
    const parsed = JSON.parse(description);
    // Extract text with proper spacing and line breaks from JSONContent
    const extractText = (content: JSONContent): string => {
      if (content.type === 'text') {
        return content.text || '';
      }
      if (content.type === 'paragraph') {
        const text = content.content?.map(extractText).join('') || '';
        return `${text}\n`;
      }
      if (content.type === 'heading') {
        const text = content.content?.map(extractText).join('') || '';
        return `${text}\n`;
      }
      if (content.type === 'listItem') {
        const text = content.content?.map(extractText).join('') || '';
        return `• ${text}\n`;
      }
      if (content.type === 'bulletList' || content.type === 'orderedList') {
        return content.content?.map(extractText).join('') || '';
      }
      if (content.content) {
        return content.content.map(extractText).join('');
      }
      return '';
    };

    const result = extractText(parsed).trim();
    // Clean up excessive newlines while preserving structure
    return result.replace(/\n{3,}/g, '\n\n');
  } catch {
    // If it's not valid JSON, return as plain text
    return description;
  }
};
