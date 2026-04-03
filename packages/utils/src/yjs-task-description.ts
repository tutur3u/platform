import type { JSONContent } from '@tiptap/core';
import { Schema } from 'prosemirror-model';
import { getDescriptionText } from './text-helper';
import { convertJsonContentToYjsState } from './yjs-helper';

export const taskDescriptionSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      attrs: { textAlign: { default: null } },
    },
    heading: {
      group: 'block',
      content: 'inline*',
      attrs: {
        level: { default: 1 },
        textAlign: { default: null },
      },
    },
    blockquote: {
      group: 'block',
      content: 'block+',
    },
    codeBlock: {
      group: 'block',
      content: 'text*',
      marks: '',
      attrs: { language: { default: null } },
      code: true,
    },
    bulletList: {
      group: 'block',
      content: 'listItem+',
    },
    orderedList: {
      group: 'block',
      content: 'listItem+',
      attrs: { start: { default: 1 } },
    },
    listItem: {
      content: 'paragraph block*',
      defining: true,
    },
    taskList: {
      group: 'block',
      content: 'taskItem+',
    },
    taskItem: {
      content: 'paragraph block*',
      attrs: { checked: { default: false } },
      defining: true,
    },
    table: {
      group: 'block',
      content: 'tableRow+',
    },
    tableRow: {
      content: '(tableCell | tableHeader)+',
    },
    tableCell: {
      content: 'block+',
      attrs: {
        colspan: { default: 1 },
        rowspan: { default: 1 },
        colwidth: { default: null },
      },
    },
    tableHeader: {
      content: 'block+',
      attrs: {
        colspan: { default: 1 },
        rowspan: { default: 1 },
        colwidth: { default: null },
      },
    },
    horizontalRule: {
      group: 'block',
    },
    imageResize: {
      group: 'block',
      atom: true,
      attrs: {
        src: { default: null },
        alt: { default: null },
        title: { default: null },
        width: { default: null },
        height: { default: null },
      },
    },
    video: {
      group: 'block',
      atom: true,
      attrs: {
        src: { default: null },
      },
    },
    youtube: {
      group: 'block',
      atom: true,
      attrs: {
        src: { default: null },
        videoId: { default: null },
      },
    },
    mention: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: {
        id: { default: null },
        label: { default: null },
        userId: { default: null },
        displayName: { default: null },
        entityId: { default: null },
        entityType: { default: null },
        avatarUrl: { default: null },
        subtitle: { default: null },
        priority: { default: null },
        listColor: { default: null },
        assignees: { default: null },
      },
    },
    text: {
      group: 'inline',
    },
    hardBreak: {
      group: 'inline',
      inline: true,
      selectable: false,
    },
  },
  marks: {
    bold: {},
    italic: {},
    strike: {},
    underline: {},
    code: {},
    subscript: {},
    superscript: {},
    textStyle: {
      attrs: {
        color: { default: null },
      },
    },
    highlight: {
      attrs: {
        color: { default: null },
      },
    },
    link: {
      attrs: {
        href: { default: null },
        target: { default: null },
        rel: { default: null },
        class: { default: null },
        title: { default: null },
      },
      inclusive: false,
    },
  },
});

/**
 * Transforms legacy 'image' nodes to 'imageResize' nodes for schema compatibility.
 * The web app uses tiptap-extension-resize-image which registers 'imageResize' only.
 */
function transformImageNodes(content: JSONContent): JSONContent {
  if (typeof content !== 'object' || content === null) {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map(transformImageNodes) as JSONContent;
  }

  const transformed: JSONContent = { ...content };

  if (transformed.type === 'image') {
    transformed.type = 'imageResize';
  }

  if (Array.isArray(transformed.content)) {
    transformed.content = transformed.content.map(transformImageNodes);
  }

  return transformed;
}

function parseDescriptionContent(description: string): JSONContent {
  try {
    const parsed = JSON.parse(description);
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      parsed.type === 'doc'
    ) {
      return transformImageNodes(parsed as JSONContent);
    }
  } catch {
    // Fall through to plain-text conversion.
  }

  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: description }],
      },
    ],
  };
}

function hasMeaningfulContent(content: JSONContent): boolean {
  return getDescriptionText(content).trim().length > 0;
}

function encodeYjsState(content: JSONContent): number[] | null {
  const encoded = convertJsonContentToYjsState(content, taskDescriptionSchema);
  if (encoded.length === 0) {
    return null;
  }
  return Array.from(encoded);
}

/**
 * Derives a task-description Yjs state array from TipTap JSON or plain text.
 * Returns null for empty descriptions or when conversion cannot succeed.
 */
export function deriveTaskDescriptionYjsState(
  description: string | null | undefined
): number[] | null {
  const normalizedDescription = description?.trim();
  if (!normalizedDescription) {
    return null;
  }

  const content = parseDescriptionContent(normalizedDescription);
  if (!hasMeaningfulContent(content)) {
    return null;
  }

  try {
    return encodeYjsState(content);
  } catch {
    const fallbackText = getDescriptionText(normalizedDescription).trim();
    if (!fallbackText) {
      return null;
    }

    try {
      return encodeYjsState({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: fallbackText }],
          },
        ],
      });
    } catch {
      return null;
    }
  }
}
