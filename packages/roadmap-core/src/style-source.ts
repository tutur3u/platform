/** Read the complete ordered stylesheet for source contract tests. */
import { readFileSync } from 'node:fs';
export function readStyles() {
  const entry = new URL('./styles.css', import.meta.url);
  const imports = readFileSync(entry, 'utf8');
  return (
    imports +
    [...imports.matchAll(/@import "([^"]+)";/g)]
      .map((match) => readFileSync(new URL(match[1], entry), 'utf8'))
      .join('\n')
  );
}
