import type { JSONContent } from '@tiptap/core';

/** Node types that have unique identifiers beyond text content */
export type IdentifiableNodeType =
  | 'image'
  | 'imageResize'
  | 'video'
  | 'youtube'
  | 'mention';

/** Attribute change details */
export interface AttributeChange {
  key: string;
  oldValue: unknown;
  newValue: unknown;
}

/** Result of comparing two nodes */
export interface NodeDiffResult {
  type: 'added' | 'removed' | 'modified';
  nodeType: string;
  path: number[];
  oldNode?: JSONContent;
  newNode?: JSONContent;
  attributeChanges?: AttributeChange[];
  /** Human-readable display label */
  displayLabel: string;
}

/** Summary of node-level changes */
export interface NodeDiffSummary {
  totalChanges: number;
  added: NodeDiffResult[];
  removed: NodeDiffResult[];
  modified: NodeDiffResult[];
  /** Quick flag for images/videos/embeds changes */
  hasMediaChanges: boolean;
}

/** Node with its path in the tree */
interface FlattenedNode {
  node: JSONContent;
  path: number[];
  identifier: string;
}

/**
 * Check if a node type is identifiable (has unique identifier beyond text)
 */
function isIdentifiableNodeType(type: string): type is IdentifiableNodeType {
  return ['image', 'imageResize', 'video', 'youtube', 'mention'].includes(type);
}

/**
 * Check if a node type is a media type
 */
function isMediaNodeType(type: string): boolean {
  return ['image', 'imageResize', 'video', 'youtube'].includes(type);
}

/**
 * Extract a unique identifier for a node.
 * For images: use src URL
 * For mentions: use id attribute
 * For other identifiable nodes: use appropriate unique attribute
 */
export function getNodeIdentifier(node: JSONContent): string {
  const type = node.type || 'unknown';

  switch (type) {
    case 'image':
    case 'imageResize':
      // Use src URL as unique identifier for images
      return `${type}:${node.attrs?.src || 'unknown'}`;

    case 'video':
      return `video:${node.attrs?.src || 'unknown'}`;

    case 'youtube':
      // YouTube embeds may use src or videoId
      return `youtube:${node.attrs?.src || node.attrs?.videoId || 'unknown'}`;

    case 'mention':
      // Mentions have unique user/entity IDs
      return `mention:${node.attrs?.id || 'unknown'}`;

    default:
      // For non-identifiable nodes, return type only (not tracked individually)
      return type;
  }
}

/**
 * Extract filename from a URL or path
 */
function extractFilename(urlOrPath: string): string {
  try {
    // Try to parse as URL first
    const url = new URL(urlOrPath);
    const pathname = url.pathname;
    const filename = pathname.split('/').pop() || pathname;
    // Decode and truncate if too long
    const decoded = decodeURIComponent(filename);
    return decoded.length > 40 ? `${decoded.slice(0, 37)}...` : decoded;
  } catch {
    // Not a valid URL, treat as path
    const filename = urlOrPath.split('/').pop() || urlOrPath;
    return filename.length > 40 ? `${filename.slice(0, 37)}...` : filename;
  }
}

/**
 * Get a human-readable label for a node (for display in UI).
 * e.g., "[Image: cat.png]" or "[Video: intro.mp4]"
 */
export function getNodeDisplayLabel(node: JSONContent): string {
  const type = node.type || 'unknown';

  switch (type) {
    case 'image':
    case 'imageResize': {
      const src = node.attrs?.src;
      const alt = node.attrs?.alt;
      if (src) {
        const filename = extractFilename(src);
        return alt ? `${alt} (${filename})` : filename;
      }
      return alt || 'Image';
    }

    case 'video': {
      const src = node.attrs?.src;
      if (src) {
        return extractFilename(src);
      }
      return 'Video';
    }

    case 'youtube': {
      const src = node.attrs?.src || node.attrs?.videoId;
      if (src) {
        // For YouTube, show video ID or title if available
        const title = node.attrs?.title;
        if (title) return title;
        // Extract video ID from URL if possible
        try {
          const url = new URL(src);
          const videoId =
            url.searchParams.get('v') || url.pathname.split('/').pop();
          return videoId ? `YouTube: ${videoId}` : 'YouTube Video';
        } catch {
          return `YouTube: ${src.slice(0, 20)}...`;
        }
      }
      return 'YouTube Video';
    }

    case 'mention': {
      const label = node.attrs?.label || node.attrs?.id || 'mention';
      return `@${label}`;
    }

    default:
      return type;
  }
}

/**
 * Flatten a JSONContent tree into a list of identifiable nodes with paths.
 * Only extracts nodes that have unique identifiers (images, videos, mentions).
 */
export function flattenMediaNodes(
  content: JSONContent | null | undefined,
  path: number[] = []
): FlattenedNode[] {
  if (!content) return [];

  const result: FlattenedNode[] = [];
  const type = content.type || '';

  // If this is an identifiable node, add it to results
  if (isIdentifiableNodeType(type)) {
    result.push({
      node: content,
      path: [...path],
      identifier: getNodeIdentifier(content),
    });
  }

  // Recursively process children
  if (content.content && Array.isArray(content.content)) {
    content.content.forEach((child, index) => {
      result.push(...flattenMediaNodes(child, [...path, index]));
    });
  }

  return result;
}

/**
 * Compare attributes of two nodes and return list of changes
 */
function compareAttributes(
  oldNode: JSONContent,
  newNode: JSONContent
): AttributeChange[] {
  const changes: AttributeChange[] = [];
  const oldAttrs = oldNode.attrs || {};
  const newAttrs = newNode.attrs || {};

  // Get all unique keys from both
  const allKeys = new Set([...Object.keys(oldAttrs), ...Object.keys(newAttrs)]);

  for (const key of allKeys) {
    const oldVal = oldAttrs[key];
    const newVal = newAttrs[key];

    // Skip src since it's used for identification
    if (key === 'src') continue;

    // Compare values (stringify for deep comparison)
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push({
        key,
        oldValue: oldVal,
        newValue: newVal,
      });
    }
  }

  return changes;
}

/**
 * Parse JSON content from various input types
 */
export function parseJsonContent(value: unknown): JSONContent | null {
  if (!value) return null;

  try {
    if (typeof value === 'string') {
      return JSON.parse(value) as JSONContent;
    }
    if (typeof value === 'object') {
      return value as JSONContent;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Compare two JSONContent structures at the node level.
 * Returns detailed diff information for each changed node.
 *
 * Algorithm:
 * 1. Flatten both trees to extract identifiable nodes
 * 2. Build maps by identifier
 * 3. Find added (in new but not old), removed (in old but not new)
 * 4. Find modified (same identifier, different attributes)
 */
export function computeNodeDiff(
  oldContent: JSONContent | null | undefined,
  newContent: JSONContent | null | undefined
): NodeDiffSummary {
  // Flatten both trees
  const oldNodes = flattenMediaNodes(oldContent);
  const newNodes = flattenMediaNodes(newContent);

  // Build maps by identifier
  // Handle duplicates by appending index if identifier already exists
  const oldByIdentifier = new Map<string, FlattenedNode>();
  const oldIdentifierCounts = new Map<string, number>();
  for (const node of oldNodes) {
    const count = oldIdentifierCounts.get(node.identifier) || 0;
    const uniqueId =
      count > 0 ? `${node.identifier}#${count}` : node.identifier;
    oldByIdentifier.set(uniqueId, { ...node, identifier: uniqueId });
    oldIdentifierCounts.set(node.identifier, count + 1);
  }

  const newByIdentifier = new Map<string, FlattenedNode>();
  const newIdentifierCounts = new Map<string, number>();
  for (const node of newNodes) {
    const count = newIdentifierCounts.get(node.identifier) || 0;
    const uniqueId =
      count > 0 ? `${node.identifier}#${count}` : node.identifier;
    newByIdentifier.set(uniqueId, { ...node, identifier: uniqueId });
    newIdentifierCounts.set(node.identifier, count + 1);
  }

  const added: NodeDiffResult[] = [];
  const removed: NodeDiffResult[] = [];
  const modified: NodeDiffResult[] = [];

  // Find added nodes (in new but not in old)
  for (const [id, newNode] of newByIdentifier) {
    if (!oldByIdentifier.has(id)) {
      added.push({
        type: 'added',
        nodeType: newNode.node.type || 'unknown',
        path: newNode.path,
        newNode: newNode.node,
        displayLabel: getNodeDisplayLabel(newNode.node),
      });
    }
  }

  // Find removed nodes (in old but not in new)
  for (const [id, oldNode] of oldByIdentifier) {
    if (!newByIdentifier.has(id)) {
      removed.push({
        type: 'removed',
        nodeType: oldNode.node.type || 'unknown',
        path: oldNode.path,
        oldNode: oldNode.node,
        displayLabel: getNodeDisplayLabel(oldNode.node),
      });
    }
  }

  // Find modified nodes (same identifier, different attributes)
  for (const [id, oldNode] of oldByIdentifier) {
    const newNode = newByIdentifier.get(id);
    if (newNode) {
      const attrChanges = compareAttributes(oldNode.node, newNode.node);
      if (attrChanges.length > 0) {
        modified.push({
          type: 'modified',
          nodeType: oldNode.node.type || 'unknown',
          path: newNode.path,
          oldNode: oldNode.node,
          newNode: newNode.node,
          attributeChanges: attrChanges,
          displayLabel: getNodeDisplayLabel(newNode.node),
        });
      }
    }
  }

  // Check if any changes involve media nodes
  const hasMediaChanges = [...added, ...removed, ...modified].some((diff) =>
    isMediaNodeType(diff.nodeType)
  );

  return {
    totalChanges: added.length + removed.length + modified.length,
    added,
    removed,
    modified,
    hasMediaChanges,
  };
}

/**
 * Get the image source URL from a node
 */
export function getNodeImageSrc(node: JSONContent): string | null {
  if (node.type === 'image' || node.type === 'imageResize') {
    return node.attrs?.src || null;
  }
  return null;
}

/**
 * Check if two JSONContent structures have any node-level differences
 */
export function hasNodeDifferences(
  oldContent: JSONContent | null | undefined,
  newContent: JSONContent | null | undefined
): boolean {
  const diff = computeNodeDiff(oldContent, newContent);
  return diff.totalChanges > 0;
}
