import type { JSONContent } from '@tiptap/react';
import type { Schema } from 'prosemirror-model';
import * as Y from 'yjs';

const PROSEMIRROR_FRAGMENT_NAME = 'prosemirror';
const HASHED_MARK_NAME_REGEX = /(.*)(--[a-zA-Z0-9+/=]{8})$/;

type TextMark = NonNullable<JSONContent['marks']>[number];
type YTextDelta = { insert: unknown; attributes?: unknown };

function getMarkName(attributeName: string): string {
  return HASHED_MARK_NAME_REGEX.exec(attributeName)?.[1] ?? attributeName;
}

function isTextNode(content: JSONContent): boolean {
  return content.type === 'text';
}

function getAttrs(attrs: JSONContent['attrs']): Record<string, unknown> {
  if (!attrs) return {};

  return Object.fromEntries(
    Object.entries(attrs).filter(
      ([key, value]) => key !== 'ychange' && value !== null
    )
  );
}

function marksToAttributes(
  marks: JSONContent['marks']
): Record<string, unknown> {
  if (!marks) return {};

  return Object.fromEntries(
    marks
      .filter((mark): mark is TextMark => Boolean(mark?.type))
      .filter((mark) => mark.type !== 'ychange')
      .map((mark) => [mark.type, mark.attrs ?? {}])
  );
}

function attributesToMarks(attrs: unknown): JSONContent['marks'] {
  if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) return;

  const marks = Object.entries(attrs).map(([type, value]) => {
    const mark: TextMark = { type: getMarkName(type) };
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length > 0
    ) {
      mark.attrs = value as Record<string, unknown>;
    }
    return mark;
  });

  return marks.length > 0 ? marks : undefined;
}

function createYText(textNodes: JSONContent[]): Y.XmlText {
  const yText = new Y.XmlText();
  const delta = textNodes
    .map((node) => ({
      insert: node.text ?? '',
      attributes: marksToAttributes(node.marks),
    }))
    .filter((item) => item.insert.length > 0);

  if (delta.length > 0) {
    yText.applyDelta(delta);
  }

  return yText;
}

function createYElement(node: JSONContent): Y.XmlElement {
  const element = new Y.XmlElement(node.type ?? 'paragraph');
  const attrs = getAttrs(node.attrs);

  for (const [key, value] of Object.entries(attrs)) {
    element.setAttribute(key, value as string);
  }

  element.insert(0, createYChildren(node.content ?? []));

  return element;
}

function createYChildren(
  content: JSONContent[]
): Array<Y.XmlElement | Y.XmlText> {
  const children: Array<Y.XmlElement | Y.XmlText> = [];
  let pendingTextNodes: JSONContent[] = [];

  const flushTextNodes = () => {
    if (pendingTextNodes.length === 0) return;
    children.push(createYText(pendingTextNodes));
    pendingTextNodes = [];
  };

  for (const node of content) {
    if (isTextNode(node)) {
      pendingTextNodes.push(node);
      continue;
    }

    flushTextNodes();
    children.push(createYElement(node));
  }

  flushTextNodes();

  return children;
}

function textNodesFromYText(text: Y.XmlText): JSONContent[] {
  return (text.toDelta() as YTextDelta[])
    .filter((delta): delta is { insert: string; attributes?: unknown } => {
      return typeof delta.insert === 'string' && delta.insert.length > 0;
    })
    .map((delta) => {
      const node: JSONContent = {
        type: 'text',
        text: delta.insert,
      };
      const marks = attributesToMarks(delta.attributes);

      if (marks) {
        node.marks = marks;
      }

      return node;
    });
}

function contentFromYChildren(
  parent: Y.XmlElement | Y.XmlFragment
): JSONContent[] {
  const content: JSONContent[] = [];

  for (const child of parent.toArray()) {
    if (child instanceof Y.XmlText) {
      content.push(...textNodesFromYText(child));
      continue;
    }

    if (child instanceof Y.XmlElement) {
      content.push(jsonFromYElement(child));
    }
  }

  return content;
}

function jsonFromYElement(element: Y.XmlElement): JSONContent {
  const node: JSONContent = {
    type: element.nodeName,
  };
  const attrs = getAttrs(element.getAttributes());
  const content = contentFromYChildren(element);

  if (Object.keys(attrs).length > 0) {
    node.attrs = attrs;
  }

  if (content.length > 0) {
    node.content = content;
  }

  return node;
}

export function convertJsonContentToYjsState(
  jsonContent: JSONContent,
  _schema: Schema
): Uint8Array {
  const ydoc = new Y.Doc();
  const fragment = ydoc.getXmlFragment(PROSEMIRROR_FRAGMENT_NAME);
  const content =
    jsonContent.type === 'doc' ? (jsonContent.content ?? []) : [jsonContent];

  fragment.insert(0, createYChildren(content));
  return Y.encodeStateAsUpdate(ydoc);
}

export function convertYjsStateToJsonContent(
  yjsState: Uint8Array,
  _schema: Schema
): JSONContent {
  const ydoc = new Y.Doc();
  Y.applyUpdate(ydoc, yjsState);

  const fragment = ydoc.getXmlFragment(PROSEMIRROR_FRAGMENT_NAME);

  return {
    type: 'doc',
    content: contentFromYChildren(fragment),
  };
}
