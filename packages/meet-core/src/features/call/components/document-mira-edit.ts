/** Structural ProseMirror node; keeps this module free of editor packages. */
export type DocumentNode = {
  isText: boolean;
  isTextblock: boolean;
  text?: string | null;
  textContent: string;
  type: { name: string };
  descendants: (
    visit: (node: DocumentNode, pos: number) => boolean | undefined | void
  ) => void;
};
export type MiraBlock = { type: 'paragraph' | 'bullet'; text: string };

const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/;

/** Plain model text becomes paragraphs and bullet items; nothing is parsed as HTML. */
export function miraTextBlocks(text: string): MiraBlock[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      BULLET.test(line)
        ? { type: 'bullet' as const, text: line.replace(BULLET, '') }
        : { type: 'paragraph' as const, text: line }
    )
    .filter((block) => block.text);
}

export function miraTextToContent(text: string) {
  const content: Array<Record<string, unknown>> = [];
  let list: Array<Record<string, unknown>> | null = null;
  for (const block of miraTextBlocks(text)) {
    const paragraph = {
      type: 'paragraph',
      content: [{ type: 'text', text: block.text }],
    };
    if (block.type === 'bullet') {
      if (!list) {
        list = [];
        content.push({ type: 'bulletList', content: list });
      }
      list.push({ type: 'listItem', content: [paragraph] });
    } else {
      list = null;
      content.push(paragraph);
    }
  }
  return content;
}

/** Text of the document with block breaks, plus each character's position. */
function indexText(doc: DocumentNode) {
  let text = '';
  const positions: number[] = [];
  let blocks = 0;
  doc.descendants((node, pos) => {
    if (node.isTextblock && blocks++ > 0) {
      text += '\n';
      positions.push(-1);
    }
    if (node.isText && node.text) {
      text += node.text;
      for (let index = 0; index < node.text.length; index++)
        positions.push(pos + index);
    }
    return true;
  });
  return { text, positions };
}

/** Finds Mira's inserted text so its requester can undo it in place. */
export function findMiraText(doc: DocumentNode, inserted: string) {
  const target = miraTextBlocks(inserted)
    .map((block) => block.text)
    .join('\n');
  if (!target) return null;
  const { text, positions } = indexText(doc);
  const start = text.indexOf(target);
  if (start < 0) return null;
  const from = positions[start];
  const last = positions[start + target.length - 1];
  if (from === undefined || last === undefined || from < 0 || last < 0)
    return null;
  return { from, to: last + 1 };
}

/** Nearest heading before the cursor names the section Mira works in. */
export function sectionAt(doc: DocumentNode, position: number) {
  let section: string | undefined;
  doc.descendants((node, pos) => {
    if (pos > position) return false;
    if (node.type.name === 'heading' && node.textContent.trim())
      section = node.textContent.trim().slice(0, 80);
    return !node.isTextblock;
  });
  return section;
}
