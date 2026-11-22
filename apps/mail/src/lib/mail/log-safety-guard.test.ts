import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { parse } from '@babel/parser';
import { describe, expect, it } from 'vitest';

type SyntaxNode = { type: string } & Record<string, unknown>;
type MemberNode = SyntaxNode & {
  type: 'MemberExpression' | 'OptionalMemberExpression';
};
type CallNode = SyntaxNode & {
  type: 'CallExpression' | 'OptionalCallExpression';
};

const repoRoot = resolve(import.meta.dirname, '../../../../..');
const mailSanitizer = 'apps/mail/src/lib/mail/log-safety';
const sharedSanitizer = '@tuturuuu/utils/log-safety';
const logMethods = new Set([
  'debug',
  'dir',
  'error',
  'info',
  'log',
  'table',
  'trace',
  'warn',
]);
const sanitizers = new Set([
  'safeErrorFields',
  'safeLogUuid',
  'safeLogWorkspaceId',
  'safeStackFrames',
]);
const sourceDirectories = [
  'apps/mail/src',
  'apps/mail/cloudflare',
  'packages/start-bridge/src',
  'packages/email-service/src',
];

function isNode(value: unknown): value is SyntaxNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string'
  );
}

function nodes(value: unknown): SyntaxNode[] {
  return Array.isArray(value) ? value.filter(isNode) : [];
}

function children(node: SyntaxNode): SyntaxNode[] {
  return Object.values(node).flatMap((value) =>
    isNode(value) ? [value] : nodes(value)
  );
}

function* descendants(node: SyntaxNode): Iterable<SyntaxNode> {
  yield node;
  for (const child of children(node)) yield* descendants(child);
}

function textOf(value: unknown): string {
  if (!isNode(value)) return '';
  if (value.type === 'Identifier' && typeof value.name === 'string')
    return value.name;
  return typeof value.value === 'string' ? value.value : '';
}

function isMember(value: unknown): value is MemberNode {
  return (
    isNode(value) &&
    (value.type === 'MemberExpression' ||
      value.type === 'OptionalMemberExpression')
  );
}

function isCall(value: unknown): value is CallNode {
  return (
    isNode(value) &&
    (value.type === 'CallExpression' || value.type === 'OptionalCallExpression')
  );
}

function memberName(node: SyntaxNode): string {
  return node.computed !== true ||
    (isNode(node.property) && node.property.type === 'StringLiteral')
    ? textOf(node.property)
    : '';
}

function bindingNames(value: unknown): string[] {
  if (!isNode(value)) return [];
  switch (value.type) {
    case 'Identifier':
      return [textOf(value)];
    case 'ObjectPattern':
      return nodes(value.properties).flatMap((property) =>
        bindingNames(
          property.type === 'RestElement' ? property.argument : property.value
        )
      );
    case 'ArrayPattern':
      return nodes(value.elements).flatMap(bindingNames);
    case 'AssignmentPattern':
      return bindingNames(value.left);
    case 'RestElement':
      return bindingNames(value.argument);
    case 'TSParameterProperty':
      return bindingNames(value.parameter);
    default:
      return [];
  }
}

function localBindings(node: SyntaxNode): string[] {
  return [
    ...bindingNames(node.id),
    ...bindingNames(node.param),
    ...nodes(node.params).flatMap(bindingNames),
  ];
}

function isTrustedModule(source: string, file: string): boolean {
  if (source === sharedSanitizer) return true;
  if (!file.startsWith('apps/mail/src/')) return false;
  if (source === '@/lib/mail/log-safety') return true;
  return (
    source.startsWith('.') &&
    resolve(repoRoot, dirname(file), source).replace(/\.[cm]?[jt]sx?$/u, '') ===
      resolve(repoRoot, mailSanitizer)
  );
}

function trustedImports(tree: SyntaxNode[], file: string): Map<string, string> {
  const imports = new Map<string, string>();
  const bindings = new Set(tree.flatMap(localBindings));
  for (const node of tree) {
    if (
      node.type !== 'ImportDeclaration' ||
      node.importKind === 'type' ||
      !isTrustedModule(textOf(node.source), file)
    )
      continue;
    for (const specifier of nodes(node.specifiers)) {
      if (
        specifier.type !== 'ImportSpecifier' ||
        specifier.importKind === 'type'
      )
        continue;
      const imported = textOf(specifier.imported);
      const local = textOf(specifier.local);
      // Reject names shadowed anywhere in the file so a local binding cannot
      // hide an unsafe call, even inside a nested function or catch block.
      if (sanitizers.has(imported) && !bindings.has(local))
        imports.set(local, imported);
    }
  }
  return imports;
}

function consoleCalls(tree: SyntaxNode[]): SyntaxNode[] {
  const consoles = new Set(['console']);
  const loggers = new Set<string>();
  const isConsole = (node: unknown) =>
    consoles.has(textOf(node)) ||
    (isMember(node) &&
      ['globalThis', 'self'].includes(textOf(node.object)) &&
      memberName(node) === 'console');

  function isLogger(node: unknown): boolean {
    if (loggers.has(textOf(node))) return true;
    if (
      isCall(node) &&
      isMember(node.callee) &&
      memberName(node.callee) === 'bind'
    ) {
      return isLogger(node.callee.object);
    }
    if (!isMember(node) || !isConsole(node.object)) return false;
    const method = memberName(node);
    return !method || logMethods.has(method);
  }

  // Follow aliases to a fixed point, including aliases declared after a
  // closure that uses them, and destructured methods.
  let previousSize: number;
  do {
    previousSize = consoles.size + loggers.size;
    for (const node of tree) {
      if (
        node.type !== 'VariableDeclarator' &&
        node.type !== 'AssignmentExpression'
      )
        continue;
      const target = node.type === 'VariableDeclarator' ? node.id : node.left;
      const value = node.type === 'VariableDeclarator' ? node.init : node.right;
      if (!isNode(target)) continue;
      if (target.type === 'Identifier') {
        if (isConsole(value)) consoles.add(textOf(target));
        if (isLogger(value)) loggers.add(textOf(target));
      } else if (target.type === 'ObjectPattern' && isConsole(value)) {
        for (const property of nodes(target.properties)) {
          if (
            property.type === 'ObjectProperty' &&
            (property.computed === true || logMethods.has(textOf(property.key)))
          ) {
            for (const binding of bindingNames(property.value))
              loggers.add(binding);
          }
        }
      }
    }
  } while (previousSize !== consoles.size + loggers.size);

  return tree.filter(
    (node) =>
      // A tagged template has no string prefix, so it always reports.
      (node.type === 'TaggedTemplateExpression' && isLogger(node.tag)) ||
      (isCall(node) &&
        (isLogger(node.callee) ||
          (isMember(node.callee) &&
            ['call', 'apply'].includes(memberName(node.callee)) &&
            isLogger(node.callee.object))))
  );
}

function safePayload(
  node: SyntaxNode,
  imports: ReadonlyMap<string, string>
): boolean {
  if (isCall(node))
    return imports.get(textOf(node.callee)) === 'safeErrorFields';
  if (node.type !== 'ObjectExpression') return false;

  return nodes(node.properties).every((property) => {
    if (property.type !== 'ObjectProperty' || property.computed === true)
      return false;
    const key = textOf(property.key);
    const value = property.value;
    if (!isNode(value)) return false;
    const sanitizer = isCall(value)
      ? imports.get(textOf(value.callee))
      : undefined;
    if (/error$/iu.test(key)) return sanitizer === 'safeErrorFields';
    if (key === 'frames') return sanitizer === 'safeStackFrames';
    if (/Id$/u.test(key))
      return sanitizer === 'safeLogUuid' || sanitizer === 'safeLogWorkspaceId';
    if (/Count$/u.test(key)) {
      return isMember(value) && memberName(value) === 'length';
    }
    return false;
  });
}

function safePrefix(node: unknown): boolean {
  if (!isNode(node)) return false;
  if (node.type === 'ConditionalExpression') {
    return safePrefix(node.consequent) && safePrefix(node.alternate);
  }
  return node.type === 'StringLiteral' && !textOf(node).includes('@');
}

function logViolations(
  source: string,
  file = mailSanitizer + '-fixture.ts'
): number[] {
  let ast: unknown;
  try {
    ast = parse(source, {
      sourceType: 'unambiguous',
      plugins: file.endsWith('x') ? ['typescript', 'jsx'] : ['typescript'],
    });
  } catch (error) {
    throw new Error('Cannot scan ' + file, { cause: error });
  }
  if (!isNode(ast) || !isNode(ast.program))
    throw new Error('Parser returned no program');
  if (
    nodes(ast.program.directives).some(
      (directive) => textOf(directive.value) === 'use client'
    )
  )
    return [];

  const tree = [...descendants(ast.program)];
  const imports = trustedImports(tree, file);
  return consoleCalls(tree).flatMap((call) => {
    const [prefix, ...payloads] = nodes(call.arguments);
    return safePrefix(prefix) &&
      payloads.every((payload) => safePayload(payload, imports))
      ? []
      : [typeof call.start === 'number' ? call.start : 0];
  });
}

function serverSource(file: string): boolean {
  return (
    /\.[cm]?[jt]sx?$/u.test(file) &&
    !/\.(?:test|spec|client|browser|d)\.[cm]?[jt]sx?$/u.test(file) &&
    !file.includes('/__tests__/') &&
    !file.startsWith('apps/mail/cloudflare/acceptance/') &&
    file !== 'packages/start-bridge/src/codegen/cli.ts'
  );
}

const sanitizerImport =
  'import { safeErrorFields, safeLogUuid } from "@tuturuuu/utils/log-safety";';

describe('Mail and shared server log safety', () => {
  it('keeps console payloads to sanitized errors, IDs and counts', () => {
    const violations = sourceDirectories.flatMap((directory) =>
      readdirSync(resolve(repoRoot, directory), {
        recursive: true,
        withFileTypes: true,
      })
        .filter((entry) => entry.isFile())
        .flatMap((entry) => {
          const path = join(entry.parentPath, entry.name);
          const file = relative(repoRoot, path);
          if (!serverSource(file)) return [];
          const source = readFileSync(path, 'utf8');
          return logViolations(source, file).map(
            (offset) => file + ':' + source.slice(0, offset).split('\n').length
          );
        })
    );
    expect(violations).toEqual([]);
  });

  it.each([
    "console.error('failure', { error })",
    "console.warn('failure', { err })",
    "console.warn('failure', { e })",
    "try { work() } catch (failure) { console.error('failure', failure) }",
    "try { work() } catch (failure) { console.error('failure', { reason: failure }) }",
    "console.error('failure', { error: result.error })",
    "console['warn']('failure', { addresses: input })",
    "console.warn('failure', { nested: { 'bcc': input } })",
    "console.warn('failure', { requestedEmails: input })",
    "console.warn('failure', { value: input.recipient })",
    "const log = console.error; log('failure', error)",
    "const { error: logError } = console; logError('failure', error)",
    "const logger = console; const log = logger.info; log('failure', error)",
    "console.info('failure', { subject })",
    "console.log('failure', { to: recipients })",
    "const payload = { error }; const alias = payload; console.log('failure', alias)",
    "const fields = error; console.log('failure', { error: fields })",
    "const safeErrorFields = (value) => value; console.error('failure', safeErrorFields(error))",
    sanitizerImport +
      "function send(safeErrorFields) { console.error('failure', safeErrorFields(error)) }",
    sanitizerImport +
      "function send({ safeErrorFields }) { console.error('failure', { error: safeErrorFields(error) }) }",
    "import { safeErrorFields } from './untrusted'; console.error('failure', safeErrorFields(error))",
    "console.warn('failure', { frames: error.stack })",
    "console.trace('failure', error)",
    'console.table([{ to: recipient }])',
    "self.console.error('failure', error)",
    'console.error`failure ${error}`',
    sanitizerImport +
      "console.warn('failure', { frames: safeErrorFields(error) })",
  ])('rejects %s', (source) => {
    expect(logViolations(source)).toHaveLength(1);
  });

  it('allows the imported sanitizers and recipient counts through console aliases', () => {
    expect(
      logViolations(
        sanitizerImport +
          "const { warn: log } = console; log('failure', { error: safeErrorFields(error), blockedCount: result.blockedRecipients.length, messageId: safeLogUuid(message.id) })"
      )
    ).toEqual([]);
  });

  it('allows call-site frames only from the Mail stack-frame sanitizer', () => {
    expect(
      logViolations(
        "import { safeErrorFields, safeStackFrames } from './log-safety'; console.warn('failure', { error: safeErrorFields(error), frames: safeStackFrames(error) })"
      )
    ).toEqual([]);
  });

  it('skips client modules with an explicit directive', () => {
    expect(logViolations("'use client'; console.log(message)")).toEqual([]);
  });
});
