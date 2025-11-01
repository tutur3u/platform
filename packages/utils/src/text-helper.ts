import type { JSONContent } from '@tiptap/core';
import type { Json } from '@tuturuuu/types';

export const removeAccents = (str: string) =>
  str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // specifically replace "đ" with "d" (both lowercase and uppercase)
    // to support Vietnamese characters
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');

export const getDescriptionText = (description?: string | Json): string => {
  if (!description) return '';

  try {
    // If description is already a Json object, use it directly
    // Otherwise, parse the string
    const parsed =
      typeof description === 'string' ? JSON.parse(description) : description;

    // Extract text with proper spacing and line breaks from TipTap JSONContent
    // This function handles the standard TipTap node structure from the text editor
    const extractText = (
      node: JSONContent,
      depth = 0,
      listCounter?: number
    ): string => {
      // Handle text nodes - the leaf nodes containing actual text
      if (node.type === 'text') {
        return node.text || '';
      }

      // Handle hard breaks (Shift+Enter in editor)
      if (node.type === 'hardBreak') {
        return '\n';
      }

      // Handle horizontal rules
      if (node.type === 'horizontalRule') {
        return '\n---\n';
      }

      // Handle block-level nodes that should have spacing

      // Paragraphs - basic text blocks
      if (node.type === 'paragraph') {
        const text =
          node.content?.map((child) => extractText(child, depth)).join('') ||
          '';
        // Empty paragraphs still create visual spacing
        return `${text}\n`;
      }

      // Headings - important sections
      if (node.type === 'heading') {
        const text =
          node.content?.map((child) => extractText(child, depth)).join('') ||
          '';
        const level = node.attrs?.level || 1;
        // Add visual hierarchy with # symbols
        const prefix = '#'.repeat(level);
        return `${prefix} ${text}\n`;
      }

      // Blockquotes - indented quoted text
      if (node.type === 'blockquote') {
        const text =
          node.content
            ?.map((child) => extractText(child, depth + 1))
            .join('') || '';
        // Indent quoted text with > symbol
        return (
          text
            .split('\n')
            .filter((line) => line.trim())
            .map((line) => `> ${line}`)
            .join('\n') + '\n'
        );
      }

      // Code blocks - preserve formatting
      if (node.type === 'codeBlock') {
        const text =
          node.content?.map((child) => extractText(child, depth)).join('') ||
          '';
        const language = node.attrs?.language || '';
        return `\`\`\`${language}\n${text}\`\`\`\n`;
      }

      // Regular lists (bullet and numbered)
      if (node.type === 'bulletList') {
        const items =
          node.content?.map((child) => extractText(child, depth)).join('') ||
          '';
        return items + '\n';
      }

      if (node.type === 'orderedList') {
        let counter = node.attrs?.start || 1;
        const items =
          node.content
            ?.map((child) => {
              const text = extractText(child, depth, counter);
              counter++;
              return text;
            })
            .join('') || '';
        return items + '\n';
      }

      if (node.type === 'listItem') {
        const text =
          node.content
            ?.map((child) => extractText(child, depth + 1))
            .join('')
            .trim() || '';
        const indent = '  '.repeat(depth);
        // Check if we have a counter (ordered list)
        const prefix =
          typeof listCounter === 'number' ? `${listCounter}.` : '•';
        return `${indent}${prefix} ${text}\n`;
      }

      // Task lists (checkboxes)
      if (node.type === 'taskList') {
        const items =
          node.content?.map((child) => extractText(child, depth)).join('') ||
          '';
        return items + '\n';
      }

      if (node.type === 'taskItem') {
        const text =
          node.content
            ?.map((child) => extractText(child, depth + 1))
            .join('')
            .trim() || '';
        const indent = '  '.repeat(depth);
        const checkbox = node.attrs?.checked ? '[x]' : '[ ]';
        return `${indent}${checkbox} ${text}\n`;
      }

      // Table structures
      if (node.type === 'table') {
        const rows =
          node.content?.map((child) => extractText(child, depth)).join('') ||
          '';
        return `\n${rows}\n`;
      }

      if (node.type === 'tableRow') {
        const cells =
          node.content?.map((child) => extractText(child, depth)).join(' | ') ||
          '';
        return `| ${cells} |\n`;
      }

      if (node.type === 'tableCell' || node.type === 'tableHeader') {
        const text =
          node.content
            ?.map((child) => extractText(child, depth))
            .join('')
            .trim() || '';
        return text;
      }

      // Media nodes - just indicate their presence
      if (node.type === 'image' || node.type === 'imageResize') {
        const alt = node.attrs?.alt || 'Image';
        return `[${alt}]`;
      }

      if (node.type === 'video') {
        return '[Video]';
      }

      if (node.type === 'youtube') {
        return '[YouTube Video]';
      }

      // Mentions - extract display text
      if (node.type === 'mention') {
        const label = node.attrs?.label || node.attrs?.id || 'mention';
        return `@${label}`;
      }

      // Doc node (root) and other container nodes
      if (node.content) {
        return node.content.map((child) => extractText(child, depth)).join('');
      }

      return '';
    };

    const result = extractText(parsed).trim();
    // Clean up excessive newlines while preserving intentional double spacing
    return result.replace(/\n{3,}/g, '\n\n');
  } catch {
    // If it's not valid JSON, return as plain text
    return typeof description === 'string' ? description : String(description);
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
  totalCheckboxes: number;
  checkedCheckboxes: number;
}

export const getDescriptionMetadata = (
  description?: string | Json
): DescriptionMetadata => {
  const metadata: DescriptionMetadata = {
    hasText: false,
    hasImages: false,
    hasVideos: false,
    hasLinks: false,
    imageCount: 0,
    videoCount: 0,
    linkCount: 0,
    totalCheckboxes: 0,
    checkedCheckboxes: 0,
  };

  if (!description) return metadata;

  try {
    // If description is already a Json object, use it directly
    // Otherwise, parse the string
    const parsed =
      typeof description === 'string' ? JSON.parse(description) : description;

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

      // Check for task items (checkboxes)
      if (content.type === 'taskItem') {
        metadata.totalCheckboxes++;
        if (content.attrs?.checked === true) {
          metadata.checkedCheckboxes++;
        }
      }

      // Recursively check child content
      if (content.content) {
        content.content.forEach(analyzeContent);
      }
    };

    analyzeContent(parsed);
  } catch {
    // If it's not valid JSON, treat as plain text
    const descText =
      typeof description === 'string' ? description : String(description);
    if (descText.trim()) {
      metadata.hasText = true;
    }
  }

  return metadata;
};
