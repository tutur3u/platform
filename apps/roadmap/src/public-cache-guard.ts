import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export type PublicCacheFinding = {
  path: string;
  line: number;
  kind: 'auth-session-import' | 'cookie-read' | 'authorization-read';
  text: string;
};

const IMPORT_SPECIFIER =
  /(?:import|export)\s+(?:type\s+)?(?:[^'"\n]*?\s+from\s+)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const HEADER_READ =
  /\.headers\s*(?:\?\s*)?\.\s*(?:get|has)\s*\(\s*['"`](cookie|authorization)['"`]/gi;
const PROPERTY_READ =
  /(?:\bdocument|\brequest|\breq|\.headers)\s*\.\s*(cookie|authorization)\b/gi;

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

/** True when the module specifier is an auth or session dependency. */
export function isAuthSessionSpecifier(specifier: string): boolean {
  return specifier.split(/[/\\]/).some((part) => {
    return part === 'auth' || part === 'session' || part === 'next-auth';
  });
}

function pushRead(
  findings: PublicCacheFinding[],
  path: string,
  line: number,
  name: string,
  text: string
) {
  const header = name.toLowerCase();
  findings.push({
    path,
    line,
    kind: header === 'cookie' ? 'cookie-read' : 'authorization-read',
    text,
  });
}

/** Personalization signals in one source file. Comments are ignored. */
export function personalizationFindings(
  source: string,
  path = 'snippet'
): PublicCacheFinding[] {
  const findings: PublicCacheFinding[] = [];
  for (const [index, line] of stripComments(source).split('\n').entries()) {
    IMPORT_SPECIFIER.lastIndex = 0;
    for (const match of line.matchAll(IMPORT_SPECIFIER)) {
      const specifier = match[1] ?? match[2] ?? '';
      if (!isAuthSessionSpecifier(specifier)) continue;
      findings.push({
        path,
        line: index + 1,
        kind: 'auth-session-import',
        text: specifier,
      });
    }
    HEADER_READ.lastIndex = 0;
    for (const match of line.matchAll(HEADER_READ)) {
      pushRead(findings, path, index + 1, match[1] ?? '', match[0]);
    }
    PROPERTY_READ.lastIndex = 0;
    for (const match of line.matchAll(PROPERTY_READ)) {
      pushRead(findings, path, index + 1, match[1] ?? '', match[0]);
    }
  }
  return findings;
}

/**
 * Personalized source may ship only when the exact public document is
 * `private` and is not given a shared s-maxage.
 */
export function assessPublicCacheGuard(input: {
  findings: readonly PublicCacheFinding[];
  cacheControl: string | null;
}): { ok: boolean; failures: string[] } {
  if (input.findings.length === 0) return { ok: true, failures: [] };
  const cache = input.cacheControl ?? '';
  const forcedPrivate = /^private\b/.test(cache) && !/\bs-maxage=/.test(cache);
  if (forcedPrivate) return { ok: true, failures: [] };
  return {
    ok: false,
    failures: input.findings.map(
      (finding) =>
        `${finding.path}:${finding.line} ${finding.kind} (${finding.text}) while cache-control is ${cache || '(missing)'}`
    ),
  };
}

function includedSource(name: string): boolean {
  if (name === 'routeTree.gen.ts') return false;
  if (name.endsWith('.test.ts') || name.endsWith('.test.tsx')) return false;
  return name.endsWith('.ts') || name.endsWith('.tsx');
}

export function scanRoadmapSource(root: string): PublicCacheFinding[] {
  const findings: PublicCacheFinding[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!includedSource(name)) continue;
      findings.push(
        ...personalizationFindings(
          readFileSync(path, 'utf8'),
          relative(root, path)
        )
      );
    }
  };
  walk(root);
  return findings;
}
