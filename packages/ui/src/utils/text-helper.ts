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

export interface DescriptionMetadata {
  hasText: boolean;
  hasImages: boolean;
  hasVideos: boolean;
  hasLinks: boolean;
  imageCount: number;
  videoCount: number;
  linkCount: number;
}

export const getDescriptionMetadata = (
  description?: string
): DescriptionMetadata => {
  const metadata: DescriptionMetadata = {
    hasText: false,
    hasImages: false,
    hasVideos: false,
    hasLinks: false,
    imageCount: 0,
    videoCount: 0,
    linkCount: 0,
  };

  if (!description) return metadata;

  try {
    const parsed = JSON.parse(description);

    const analyzeContent = (content: JSONContent): void => {
      // Check for text content
      if (content.type === 'text' && content.text?.trim()) {
        metadata.hasText = true;
      }

      // Check for images (both 'image' and 'imageResize' node types)
      if (content.type === 'image' || content.type === 'imageResize') {
        metadata.hasImages = true;
        metadata.imageCount++;
      }

      // Check for videos
      if (content.type === 'video') {
        metadata.hasVideos = true;
        metadata.videoCount++;
      }

      // Check for YouTube embeds
      if (content.type === 'youtube') {
        metadata.hasVideos = true;
        metadata.videoCount++;
      }

      // Check for links (marks within text nodes)
      if (content.marks?.some((mark) => mark.type === 'link')) {
        metadata.hasLinks = true;
        metadata.linkCount++;
      }

      // Recursively check child content
      if (content.content) {
        content.content.forEach(analyzeContent);
      }
    };

    analyzeContent(parsed);
  } catch {
    // If it's not valid JSON, treat as plain text
    if (description.trim()) {
      metadata.hasText = true;
    }
  }

  return metadata;
};
