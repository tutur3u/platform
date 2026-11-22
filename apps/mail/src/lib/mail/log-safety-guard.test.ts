import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parse } from '@babel/parser';
import { describe, expect, it } from 'vitest';

type SyntaxNode = { type: string } & Record<string, unknown>;

const mailRoot = resolve(import.meta.dirname, '../../..');
const addressField = /e_?mails?|address|recipient|^(?:to|from|cc|bcc)$/iu;
const rawPayloadField =
  /^(?:message|details|hint|stack|cause|body|response)$/iu;
const errorField = /(?:error$|^(?:err|e)$)/iu;

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

function children(node: SyntaxNode) {
  return Object.values(node).flatMap((value) =>
    isNode(value) ? [value] : nodes(value)
  );
}

function textOf(value: unknown): string {
  if (!isNode(value)) return '';
  if (value.type === 'Identifier' && typeof value.name === 'string')
    return value.name;
  if (value.type === 'StringLiteral' && typeof value.value === 'string')
    return value.value;
  return '';
}

function isMember(node: SyntaxNode) {
  return (
    node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression'
  );
}

function isSanitized(value: unknown) {
  return (
    isNode(value) &&
    value.type === 'CallExpression' &&
    textOf(value.callee) === 'safeErrorFields'
  );
}

function unsafePayload(node: SyntaxNode, caught: ReadonlySet<string>): boolean {
  if (isSanitized(node)) return false;
  const unsafeVariable = (name: string) =>
    errorField.test(name) || addressField.test(name) || caught.has(name);
  const unsafeName = (name: string) =>
    unsafeVariable(name) || rawPayloadField.test(name);

  if (node.type === 'Identifier') return unsafeName(textOf(node));
  if (node.type === 'StringLiteral') return textOf(node).includes('@');
  if (node.type === 'SpreadElement' || node.type === 'ObjectMethod')
    return true;

  if (node.type === 'ObjectProperty') {
    const key = textOf(node.key);
    return (
      !key ||
      (node.computed === true &&
        isNode(node.key) &&
        node.key.type !== 'StringLiteral') ||
      addressField.test(key) ||
      rawPayloadField.test(key) ||
      (errorField.test(key) && !isSanitized(node.value)) ||
      (isNode(node.value) && unsafePayload(node.value, caught))
    );
  }
  if (isMember(node)) {
    const key = textOf(node.property);
    if (key === 'length' && node.computed !== true) return false;
    // MailReadTimeout.stage names an internal read operation.
    if (
      key === 'stage' &&
      node.computed !== true &&
      caught.has(textOf(node.object))
    )
      return false;
    if (
      !key ||
      (node.computed === true &&
        isNode(node.property) &&
        node.property.type !== 'StringLiteral') ||
      unsafeName(key)
    )
      return true;
    if (isNode(node.object) && node.object.type === 'Identifier') {
      return unsafeVariable(textOf(node.object));
    }
  }

  return children(node).some((child) => unsafePayload(child, caught));
}

function logViolations(source: string) {
  const violations: number[] = [];
  const ast: unknown = parse(source, {
    sourceType: 'unambiguous',
    plugins: ['typescript', 'jsx'],
  });

  function visit(node: SyntaxNode, caught: ReadonlySet<string>) {
    if (node.type === 'CatchClause') {
      const binding = textOf(node.param);
      if (binding) caught = new Set([...caught, binding]);
    }
    const callee = node.callee;
    if (
      (node.type === 'CallExpression' ||
        node.type === 'OptionalCallExpression') &&
      isNode(callee) &&
      isMember(callee) &&
      textOf(callee.object) === 'console' &&
      ['error', 'warn'].includes(textOf(callee.property))
    ) {
      const [prefix, ...payloads] = nodes(node.arguments);
      if (
        prefix?.type !== 'StringLiteral' ||
        unsafePayload(prefix, caught) ||
        payloads.some(
          (payload) =>
            !isSanitized(payload) &&
            (payload.type !== 'ObjectExpression' ||
              unsafePayload(payload, caught))
        )
      ) {
        violations.push(typeof node.start === 'number' ? node.start : 0);
      }
    }
    for (const child of children(node)) visit(child, caught);
  }

  if (!isNode(ast)) throw new Error('Parser returned no syntax tree');
  visit(ast, new Set());
  return violations;
}

describe('Mail server log safety', () => {
  it('keeps raw errors and address fields out of console warnings and errors', () => {
    const violations = ['src', 'cloudflare'].flatMap((directory) =>
      readdirSync(join(mailRoot, directory), {
        recursive: true,
        withFileTypes: true,
      })
        .filter(
          (entry) =>
            entry.isFile() &&
            /\.tsx?$/u.test(entry.name) &&
            !/\.test\./u.test(entry.name)
        )
        .flatMap((entry) => {
          const path = join(entry.parentPath, entry.name);
          const source = readFileSync(path, 'utf8');
          return logViolations(source).map(
            (offset) =>
              relative(mailRoot, path) +
              ':' +
              source.slice(0, offset).split('\n').length
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
  ])('rejects %s', (source) => {
    expect(logViolations(source)).toHaveLength(1);
  });

  it('allows sanitized errors, internal IDs and counts', () => {
    expect(
      logViolations(
        "console.warn('failure', { error: safeErrorFields(error), blockedCount: result.blockedRecipients.length, messageId: message.id, status: response.status, mailboxId })"
      )
    ).toEqual([]);
  });
});
