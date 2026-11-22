/**
 * Call-site frames from an error stack for operational logs: the function
 * name, the bundle file basename and the line and column, for at most six
 * frames. Messages, arguments, paths and any frame that does not match the
 * expected shape are dropped.
 */
const FRAME =
  /^\s*at (?:(?<fn>[\w$.<>\[\] ]{1,80}) \()?(?:[^()\s]*\/)?(?<file>[\w.-]{1,80}):(?<line>\d{1,7}):(?<col>\d{1,7})\)?\s*$/u;

export function safeStackFrames(error: unknown, limit = 6): string[] {
  let stack: unknown;
  try {
    stack = error instanceof Error ? error.stack : undefined;
  } catch {
    return [];
  }
  if (typeof stack !== 'string') return [];
  const frames: string[] = [];
  for (const line of stack.slice(0, 8_000).split('\n').slice(1)) {
    const match = FRAME.exec(line);
    if (!match?.groups) continue;
    const { col, file, fn, line: lineNumber } = match.groups;
    frames.push(`${fn?.trim() || '<anonymous>'}@${file}:${lineNumber}:${col}`);
    if (frames.length >= limit) break;
  }
  return frames;
}
