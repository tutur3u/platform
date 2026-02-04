import type { JSONContent } from '@tiptap/react';

/**
 * Node types that are considered images and need to be extracted from paragraphs
 * when migrating from inline to block-level mode.
 */
const IMAGE_NODE_TYPES = ['image', 'imageResize'];

/**
 * Migrates content from inline images (inside paragraphs) to block-level images.
 * This ensures backward compatibility when switching from inline: true to inline: false.
 *
 * Before (inline):
 * ```json
 * {
 *   "type": "paragraph",
 *   "content": [
 *     { "type": "text", "text": "Here is an image: " },
 *     { "type": "imageResize", "attrs": { "src": "...", "width": 480 } }
 *   ]
 * }
 * ```
 *
 * After (block):
 * ```json
 * {
 *   "type": "paragraph",
 *   "content": [{ "type": "text", "text": "Here is an image:" }]
 * },
 * {
 *   "type": "imageResize",
 *   "attrs": { "src": "...", "width": 480 }
 * }
 * ```
 */
export function migrateInlineImagesToBlock(
  content: JSONContent | null
): JSONContent | null {
  if (!content || !content.content) return content;

  const newContent: JSONContent[] = [];

  for (const node of content.content) {
    // Recursively migrate nested structures (lists, blockquotes, etc.)
    if (node.content && !IMAGE_NODE_TYPES.includes(node.type || '')) {
      const migratedNode = migrateNodeContent(node);
      if (migratedNode.extractedImages.length > 0) {
        // Add the node with non-image content (if it has any)
        if (hasNonEmptyContent(migratedNode.node)) {
          newContent.push(migratedNode.node);
        }
        // Add extracted images as block-level nodes
        newContent.push(...migratedNode.extractedImages);
      } else {
        newContent.push(migratedNode.node);
      }
    } else {
      newContent.push(node);
    }
  }

  return {
    ...content,
    content: newContent,
  };
}

interface MigratedNode {
  node: JSONContent;
  extractedImages: JSONContent[];
}

/**
 * Recursively migrates a node's content, extracting inline images from paragraphs.
 */
function migrateNodeContent(node: JSONContent): MigratedNode {
  // Handle paragraph nodes - extract inline images
  if (node.type === 'paragraph' && node.content?.length) {
    return extractImagesFromParagraph(node);
  }

  // Handle container nodes (list items, blockquotes, table cells, etc.) - recurse into children
  if (node.content?.length) {
    const migratedChildren: JSONContent[] = [];
    const allExtractedImages: JSONContent[] = [];

    for (const child of node.content) {
      if (child.content && !IMAGE_NODE_TYPES.includes(child.type || '')) {
        const result = migrateNodeContent(child);

        if (result.extractedImages.length > 0) {
          // Only add the child if it has non-empty content
          if (hasNonEmptyContent(result.node)) {
            migratedChildren.push(result.node);
          }
          allExtractedImages.push(...result.extractedImages);
        } else {
          migratedChildren.push(result.node);
        }
      } else {
        migratedChildren.push(child);
      }
    }

    return {
      node: { ...node, content: migratedChildren },
      extractedImages: allExtractedImages,
    };
  }

  return { node, extractedImages: [] };
}

/**
 * Extracts image nodes from a paragraph, returning the text-only paragraph
 * and the extracted images separately.
 */
function extractImagesFromParagraph(paragraph: JSONContent): MigratedNode {
  if (!paragraph.content) {
    return { node: paragraph, extractedImages: [] };
  }

  const textContent: JSONContent[] = [];
  const images: JSONContent[] = [];

  for (const child of paragraph.content) {
    if (IMAGE_NODE_TYPES.includes(child.type || '')) {
      images.push(child);
    } else {
      textContent.push(child);
    }
  }

  // If no images were extracted, return original
  if (images.length === 0) {
    return { node: paragraph, extractedImages: [] };
  }

  // Return paragraph with text-only content, and extracted images
  return {
    node: { ...paragraph, content: textContent },
    extractedImages: images,
  };
}

/**
 * Checks if a node has non-empty content (text or meaningful children).
 * Empty paragraphs should be filtered out when all content was extracted.
 */
function hasNonEmptyContent(node: JSONContent): boolean {
  if (!node.content || node.content.length === 0) return false;

  return node.content.some((child) => {
    // Check for text content
    if (child.text && child.text.trim().length > 0) return true;

    // Check for meaningful node types (not just empty containers)
    if (
      child.type &&
      ['hardBreak', 'mention', 'image', 'imageResize', 'video'].includes(
        child.type
      )
    ) {
      return true;
    }

    // Recursively check children
    if (child.content) return hasNonEmptyContent(child);

    return false;
  });
}

/**
 * Checks if content contains any inline images that need migration.
 * Used to avoid unnecessary processing.
 */
export function needsMigration(content: JSONContent | null): boolean {
  if (!content || !content.content) return false;

  function checkNode(node: JSONContent): boolean {
    // Check if this is a paragraph with inline images
    if (node.type === 'paragraph' && node.content?.length) {
      const hasImage = node.content.some((child) =>
        IMAGE_NODE_TYPES.includes(child.type || '')
      );
      if (hasImage) return true;
    }

    // Recursively check children
    if (node.content?.length) {
      return node.content.some((child) => checkNode(child));
    }

    return false;
  }

  return content.content.some((node) => checkNode(node));
}
