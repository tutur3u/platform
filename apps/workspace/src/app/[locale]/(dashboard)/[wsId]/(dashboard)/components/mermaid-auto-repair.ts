export const MERMAID_AUTO_REPAIR_PREFIX = '[AUTO_MERMAID_REPAIR]';

const MERMAID_BLOCK_REGEX = /```mermaid\s*([\s\S]*?)```/gi;

export function extractMermaidBlocks(markdown: string): string[] {
  if (!markdown) return [];
  const blocks: string[] = [];
  let match: RegExpExecArray | null = null;
  while (true) {
    match = MERMAID_BLOCK_REGEX.exec(markdown);
    if (match === null) break;
    const body = match[1]?.trim();
    if (body) blocks.push(body);
  }
  return blocks;
}

export function buildMermaidAutoRepairPrompt(params: {
  parseError: string;
  originalDiagram: string;
}): string {
  const error = params.parseError.trim();
  const diagram = params.originalDiagram.trim();
  return `${MERMAID_AUTO_REPAIR_PREFIX}
The previous Mermaid diagram failed to parse. Please fix it automatically.

Rules:
1. Return ONLY one corrected mermaid fenced code block.
2. Keep the original meaning and structure as much as possible.
3. Do not include explanations outside the code block.

Parser error:
${error}

Original diagram:
\`\`\`mermaid
${diagram}
\`\`\``;
}

export function isAutoMermaidRepairPrompt(text: string): boolean {
  return text.trimStart().startsWith(MERMAID_AUTO_REPAIR_PREFIX);
}

export function simpleStableHash(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return String(hash);
}
