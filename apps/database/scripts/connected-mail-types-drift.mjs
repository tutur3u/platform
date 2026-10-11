#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

export const connectedMailTables = [
  'mail_connected_accounts',
  'mail_oauth_requests',
  'mail_connected_sends',
];
function memberName(node) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'StringLiteral') return node.value;
  return null;
}
function member(type, name) {
  if (type.type !== 'TSTypeLiteral') throw new Error('Expected a schema type');
  const matches = type.members.filter(
    (node) =>
      node.type === 'TSPropertySignature' && memberName(node.key) === name
  );
  if (matches.length !== 1 || !matches[0].typeAnnotation)
    throw new Error(`Missing or duplicated schema member: ${name}`);
  return matches[0].typeAnnotation.typeAnnotation;
}
const presentationFields = new Set([
  'start',
  'end',
  'loc',
  'extra',
  'leadingComments',
  'trailingComments',
  'innerComments',
]);
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => !presentationFields.has(key))
      .sort()
      .map((key) => [key, normalize(value[key])])
  );
}
function mailContracts(text) {
  let source;
  try {
    source = parse(text, {
      sourceType: 'module',
      plugins: ['typescript'],
      attachComment: false,
    });
  } catch {
    throw new Error('Generated schema types are not valid TypeScript');
  }
  const aliases = source.program.body
    .map((node) =>
      node.type === 'ExportNamedDeclaration' ? node.declaration : node
    )
    .filter(
      (node) =>
        node?.type === 'TSTypeAliasDeclaration' && node.id.name === 'Database'
    );
  if (aliases.length !== 1) throw new Error('Expected one Database type');
  const tables = member(member(aliases[0].typeAnnotation, 'private'), 'Tables');
  return connectedMailTables.map((name) => [
    name,
    normalize(member(tables, name)),
  ]);
}
export function assertConnectedMailTypesMatch(committed, generated) {
  const expected = mailContracts(committed);
  const actual = mailContracts(generated);
  for (let index = 0; index < expected.length; index++) {
    if (JSON.stringify(expected[index]) !== JSON.stringify(actual[index]))
      throw new Error(
        `Private Connected Mail type drift: ${expected[index][0]}`
      );
  }
  return { tables: connectedMailTables, matched: expected.length };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const committed = execFileSync(
    'git',
    ['show', 'HEAD:packages/types/src/supabase.ts'],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
  );
  const generated = readFileSync('packages/types/src/supabase.ts', 'utf8');
  console.log(
    JSON.stringify(assertConnectedMailTypesMatch(committed, generated))
  );
}
