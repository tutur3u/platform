/**
 * Structural problems left in rendered legal markdown after held text is
 * stripped: an orphaned bold heading, an empty list item, a table row with an
 * empty cell, or a table with no rows.
 */
export function structuralProblems(markdown: string): string[] {
  const problems: string[] = [];
  const lines = markdown.split('\n');
  const isBoldOnly = (line: string) => /^\*\*[^*]+\*\*$/u.test(line.trim());
  lines.forEach((line, index) => {
    const next = lines.slice(index + 1).find((l) => l.trim());
    if (isBoldOnly(line) && (!next || isBoldOnly(next)))
      problems.push(`orphaned heading: ${line}`);
    if (/^(\*|-|\d+\.)\s*$/u.test(line.trim()))
      problems.push(`empty list item at line ${index + 1}`);
    if (line.startsWith('|') && !/^\|(\s*:?-+:?\s*\|)+$/u.test(line)) {
      const cells = line.split('|').slice(1, -1);
      if (cells.some((cell) => !cell.trim()))
        problems.push(`table row with an empty cell: ${line}`);
    }
    const separator = /^\|(\s*:?-+:?\s*\|)+$/u.test(line);
    if (separator && !lines[index + 1]?.startsWith('|'))
      problems.push(`table without rows before line ${index + 2}`);
  });
  return problems;
}
