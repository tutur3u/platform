import { Parser } from 'htmlparser2';
import { z } from 'zod';

export const formattedRunSchema = z.object({
  text: z.string().max(1_000_000),
  italic: z.literal(true).optional(),
  bold: z.literal(true).optional(),
  vertical: z.enum(['superscript', 'subscript']).optional(),
  href: z.string().max(4000).optional(),
});
export const formattedOutputSchema = z.object({
  runs: z.array(formattedRunSchema).max(10_000),
});
export type FormattedRun = z.infer<typeof formattedRunSchema>;
export type FormattedOutput = z.infer<typeof formattedOutputSchema>;

export function safeCitationLink(
  value: string | undefined
): string | undefined {
  if (!value || value.length > 4000) return undefined;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

type Marks = Omit<FormattedRun, 'text'>;

/** The engine HTML is parsed into a text-only allowlist, never passed through. */
export function parseFormattedHtml(html: string): FormattedOutput {
  if (html.length > 1_000_000)
    throw new RangeError('Citation output exceeds its size limit');
  const runs: FormattedRun[] = [];
  const stack: { tag: string; marks: Marks }[] = [];
  let suppressed = 0;
  const append = (text: string) => {
    if (!text || suppressed > 0) return;
    const marks = stack.at(-1)?.marks ?? {};
    const previous = runs.at(-1);
    if (
      previous &&
      previous.italic === marks.italic &&
      previous.bold === marks.bold &&
      previous.vertical === marks.vertical &&
      previous.href === marks.href
    ) {
      previous.text += text;
    } else runs.push({ ...marks, text });
  };
  const parser = new Parser(
    {
      onopentag(tag, attrs) {
        if (tag === 'script' || tag === 'style') suppressed += 1;
        const marks: Marks = { ...stack.at(-1)?.marks };
        if (
          ['i', 'em'].includes(tag) ||
          /(?:^|;)\s*font-style\s*:\s*italic(?:;|$)/i.test(attrs.style ?? '')
        )
          marks.italic = true;
        if (
          ['b', 'strong'].includes(tag) ||
          /(?:^|;)\s*font-weight\s*:\s*(?:bold|700)(?:;|$)/i.test(
            attrs.style ?? ''
          )
        )
          marks.bold = true;
        if (tag === 'sup') marks.vertical = 'superscript';
        if (tag === 'sub') marks.vertical = 'subscript';
        if (tag === 'a') marks.href = safeCitationLink(attrs.href);
        if (tag === 'br') append('\n');
        stack.push({ tag, marks });
      },
      onclosetag(tag) {
        if ((tag === 'script' || tag === 'style') && suppressed > 0)
          suppressed -= 1;
        for (let index = stack.length - 1; index >= 0; index -= 1) {
          if (stack[index]?.tag === tag) {
            stack.length = index;
            break;
          }
        }
      },
      ontext: append,
    },
    { decodeEntities: true }
  );
  parser.end(html);
  while (runs[0] && !runs[0].text.trim()) runs.shift();
  while (runs.at(-1) && !runs.at(-1)?.text.trim()) runs.pop();
  const first = runs[0];
  if (first) first.text = first.text.trimStart();
  const last = runs.at(-1);
  if (last) last.text = last.text.trimEnd();
  return formattedOutputSchema.parse({ runs });
}

export function toPlainText(output: FormattedOutput): string {
  return output.runs.map(({ text }) => text).join('');
}

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export function toHtml(output: FormattedOutput): string {
  return output.runs
    .map((run) => {
      let text = escapeHtml(run.text).replace(/\n/g, '<br>');
      if (run.italic) text = `<em>${text}</em>`;
      if (run.bold) text = `<strong>${text}</strong>`;
      if (run.vertical)
        text = `<${run.vertical === 'superscript' ? 'sup' : 'sub'}>${text}</${run.vertical === 'superscript' ? 'sup' : 'sub'}>`;
      const href = safeCitationLink(run.href);
      if (href)
        text = `<a href="${escapeHtml(href)}" rel="noopener noreferrer">${text}</a>`;
      return text;
    })
    .join('');
}

export function toMarkdown(output: FormattedOutput): string {
  return output.runs
    .map((run) => {
      let text = run.text.replace(/[\\`*_[\]<>]/g, '\\$&');
      if (run.italic) text = `*${text}*`;
      if (run.bold) text = `**${text}**`;
      const href = safeCitationLink(run.href)
        ?.replace(/\(/g, '%28')
        .replace(/\)/g, '%29');
      if (href) text = `[${text}](${href})`;
      return text;
    })
    .join('');
}

export type CitationTextNode = {
  type: 'text';
  text: string;
  marks?: { type: string; attrs?: { href: string } }[];
};
export function toTiptapNodes(output: FormattedOutput): CitationTextNode[] {
  return output.runs
    .filter(({ text }) => text.length > 0)
    .map((run) => {
      const marks: NonNullable<CitationTextNode['marks']> = [];
      if (run.italic) marks.push({ type: 'italic' });
      if (run.bold) marks.push({ type: 'bold' });
      if (run.vertical) marks.push({ type: run.vertical });
      const href = safeCitationLink(run.href);
      if (href) marks.push({ type: 'link', attrs: { href } });
      return {
        type: 'text',
        text: run.text,
        ...(marks.length ? { marks } : {}),
      };
    });
}

export function toQuillDelta(output: FormattedOutput) {
  return {
    ops: output.runs.map((run) => ({
      insert: run.text,
      attributes: {
        ...(run.italic ? { italic: true } : {}),
        ...(run.bold ? { bold: true } : {}),
        ...(run.vertical
          ? { script: run.vertical === 'superscript' ? 'super' : 'sub' }
          : {}),
        ...(safeCitationLink(run.href)
          ? { link: safeCitationLink(run.href) }
          : {}),
      },
    })),
  };
}
