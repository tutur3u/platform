export type CheckLanguage = 'c' | 'cpp' | 'java';

export interface CheckDiagnostic {
  path: string;
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  code?: string;
  source: 'gcc' | 'g++' | 'javac';
}

export const MAX_DIAGNOSTICS = 200;
const MAX_MESSAGE_LENGTH = 1000;
// Text from a file outside the request (a toolchain header, or any absolute
// path a source includes) is never echoed back, only where it was included.
const INCLUDED_FILE_MESSAGE = 'Problem in an included file';

const GCC_DIAGNOSTIC =
  /^(?<path>[^:\n]+):(?<line>\d+):(?:(?<column>\d+):)? (?<kind>fatal error|error|warning|note): (?<message>.*)$/u;
const GCC_INCLUDED =
  /^(?:In file included|\s+) from (?<path>[^:\n]+):(?<line>\d+)[:,]?$/u;
const GCC_FLAG = /\s\[(?<flag>-W[\w=+-]+)\]$/u;
const JAVAC_DIAGNOSTIC =
  /^(?<path>[^:\n]+\.java):(?<line>\d+): (?<kind>error|warning): (?<message>.*)$/u;
const JAVAC_LINT = /^\[(?<lint>[\w-]+)\] (?<message>.*)$/u;

function normalize(path: string) {
  return path.startsWith('./') ? path.slice(2) : path;
}

function severity(kind: string): CheckDiagnostic['severity'] {
  return kind === 'warning' ? 'warning' : kind === 'note' ? 'info' : 'error';
}

function clip(message: string) {
  return message.length > MAX_MESSAGE_LENGTH
    ? `${message.slice(0, MAX_MESSAGE_LENGTH - 1)}…`
    : message;
}

function parseGcc(
  language: 'c' | 'cpp',
  paths: ReadonlySet<string>,
  output: string
): CheckDiagnostic[] {
  const source = language === 'c' ? 'gcc' : 'g++';
  const diagnostics: CheckDiagnostic[] = [];
  // Include sites, innermost first, for the diagnostics that follow them.
  let includes: { path: string; line: number }[] = [];
  let chainOpen = false;
  // One generic diagnostic per include site and severity.
  const reported = new Set<string>();
  for (const line of output.split('\n')) {
    const included = GCC_INCLUDED.exec(line)?.groups;
    if (included) {
      if (!chainOpen) includes = [];
      chainOpen = true;
      includes.push({
        path: normalize(included.path!),
        line: Math.max(1, Number(included.line)),
      });
      continue;
    }
    const match = GCC_DIAGNOSTIC.exec(line)?.groups;
    if (!match) continue;
    chainOpen = false;
    const path = normalize(match.path!);
    let message = match.message!;
    const flag = GCC_FLAG.exec(message)?.groups?.flag;
    if (flag) message = message.slice(0, -(flag.length + 3));
    if (paths.has(path)) {
      diagnostics.push({
        path,
        line: Math.max(1, Number(match.line)),
        column: Math.max(1, Number(match.column ?? 1)),
        severity: severity(match.kind!),
        message: clip(message),
        ...(flag ? { code: flag } : {}),
        source,
      });
      continue;
    }
    const site = includes.find((include) => paths.has(include.path));
    const kind = severity(match.kind!);
    const key = site && `${site.path}:${site.line}:${kind}`;
    if (site && key && match.kind !== 'note' && !reported.has(key)) {
      reported.add(key);
      diagnostics.push({
        path: site.path,
        line: site.line,
        column: 1,
        severity: kind,
        message: INCLUDED_FILE_MESSAGE,
        source,
      });
    }
  }
  return diagnostics;
}

function parseJavac(
  paths: ReadonlySet<string>,
  output: string
): CheckDiagnostic[] {
  const diagnostics: CheckDiagnostic[] = [];
  const lines = output.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const match = JAVAC_DIAGNOSTIC.exec(lines[index]!)?.groups;
    if (!match) continue;
    const path = normalize(match.path!);
    if (!paths.has(path)) continue;
    // javac prints the source line, then a caret under the column.
    const caret = lines[index + 2]?.indexOf('^') ?? -1;
    const lint = JAVAC_LINT.exec(match.message!)?.groups;
    diagnostics.push({
      path,
      line: Math.max(1, Number(match.line)),
      column: caret >= 0 ? caret + 1 : 1,
      severity: severity(match.kind!),
      message: clip(lint?.message ?? match.message!),
      ...(lint ? { code: lint.lint } : {}),
      source: 'javac',
    });
  }
  return diagnostics;
}

/** Diagnostics for request paths only, 1-based, capped at MAX_DIAGNOSTICS. */
export function parseDiagnostics(
  language: CheckLanguage,
  requestPaths: readonly string[],
  output: string,
  outputTruncated: boolean
): { diagnostics: CheckDiagnostic[]; truncated: boolean } {
  const paths = new Set(requestPaths);
  const all =
    language === 'java'
      ? parseJavac(paths, output)
      : parseGcc(language, paths, output);
  return {
    diagnostics: all.slice(0, MAX_DIAGNOSTICS),
    truncated: outputTruncated || all.length > MAX_DIAGNOSTICS,
  };
}

/** The files a check compiles: the entry, or every source of the language. */
export function checkSources(
  language: CheckLanguage,
  paths: readonly string[],
  entry?: string
) {
  if (language === 'java')
    return paths.filter((path) => path.endsWith('.java'));
  const pattern = language === 'c' ? /\.c$/u : /\.(?:cc|cpp|cxx)$/u;
  // The driver picks the language from the extension, so an entry of
  // another language is never compiled.
  if (entry) return paths.includes(entry) && pattern.test(entry) ? [entry] : [];
  return paths.filter((path) => pattern.test(path));
}
