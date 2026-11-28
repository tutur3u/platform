import { stableJson } from './body-hash';
import { exportMarkdown } from './markdown-export';
import { WikiMarkdownError } from './markdown-format';
import { parseWikiMarkdown } from './markdown-import';
import { wikiDocumentSchema } from './schema';

export { WikiMarkdownError } from './markdown-format';
export { parseWikiMarkdown, type WikiMarkdownOptions } from './markdown-import';

/** Exports only documents the Markdown dialect can read back without data loss. */
export function stringifyWikiMarkdown(
  input: unknown,
  frontmatter: Record<string, unknown> = {}
): string {
  const body = wikiDocumentSchema.parse(input);
  const markdown = exportMarkdown(body, frontmatter);
  const roundTrip = parseWikiMarkdown(markdown);
  if (
    stableJson(roundTrip.body) !== stableJson(body) ||
    stableJson(roundTrip.frontmatter) !== stableJson(frontmatter)
  )
    throw new WikiMarkdownError(
      'Document cannot be represented losslessly in the Markdown dialect'
    );
  return markdown;
}
