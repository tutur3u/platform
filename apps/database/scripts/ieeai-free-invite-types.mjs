import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import {
  generateTypesFromDisposableStack,
  writeTypegenOutputAtomically,
} from './run-supabase-isolated-typegen.js';

function name(node) {
  return node.key?.name ?? node.key?.value;
}

function properties(source, group) {
  const ast = parse(source, { sourceType: 'module', plugins: ['typescript'] });
  const db = ast.program.body
    .map((n) => n.declaration ?? n)
    .find(
      (n) => n.type === 'TSTypeAliasDeclaration' && n.id.name === 'Database'
    );
  assert.ok(db, 'Database alias required');
  const privateSchema = db.typeAnnotation.members.find(
    (n) => name(n) === 'private'
  );
  const container = privateSchema.typeAnnotation.typeAnnotation.members.find(
    (n) => name(n) === group
  ).typeAnnotation.typeAnnotation;
  assert.equal(container.type, 'TSTypeLiteral');
  return container;
}

export function reconcileIeeaiInviteTypes(committed, generated) {
  const edits = [];
  for (const [group, key] of [
    ['Tables', 'ieeai_invite_acceptances'],
    ['Functions', 'accept_ieeai_free_workspace_invite'],
  ]) {
    const source = properties(generated, group);
    const matches = source.members.filter((n) => name(n) === key);
    assert.equal(matches.length, 1, `Expected exactly one generated ${key}`);
    const entry = generated.slice(matches[0].start, matches[0].end);
    const target = properties(committed, group);
    const existing = target.members.find((n) => name(n) === key);
    const following = target.members.find((n) => name(n) > key);
    edits.push(
      existing
        ? { start: existing.start, end: existing.end, text: entry }
        : {
            start: following?.start ?? target.end - 1,
            end: following?.start ?? target.end - 1,
            text: `${entry}\n`,
          }
    );
  }
  return edits
    .sort((a, b) => b.start - a.start)
    .reduce(
      (text, edit) =>
        text.slice(0, edit.start) + edit.text + text.slice(edit.end),
      committed
    );
}

export async function generateIeeaiInviteTypes(options) {
  const target = path.join(
    options.metadata.repositoryRoot,
    'packages/types/src/supabase.ts'
  );
  const committed = readFileSync(target, 'utf8');
  return generateTypesFromDisposableStack({
    ...options,
    writer: async (_root, _output, contents) => {
      const generated = contents.toString('utf8');
      const selected = reconcileIeeaiInviteTypes(committed, generated);
      // Validate syntax and both selected contracts before replacing the file.
      assert.equal(reconcileIeeaiInviteTypes(selected, generated), selected);
      const formatted = execFileSync(
        path.join(options.metadata.repositoryRoot, 'node_modules/.bin/oxfmt'),
        ['--stdin-filepath', target],
        {
          input: selected,
          encoding: 'utf8',
          cwd: options.metadata.repositoryRoot,
          maxBuffer: 16 * 1024 * 1024,
        }
      );
      console.log(
        `Full generated schema SHA256: ${createHash('sha256').update(contents).digest('hex')}`
      );
      if (process.env.IEEAI_INVITE_EVIDENCE_DIR) {
        writeFileSync(
          path.join(
            process.env.IEEAI_INVITE_EVIDENCE_DIR,
            'generated-schema-full.ts'
          ),
          contents
        );
      }
      await writeTypegenOutputAtomically(
        options.metadata.repositoryRoot,
        options.metadata.typegenOutput,
        Buffer.from(formatted)
      );
      console.log(
        `Scoped generated schema SHA256: ${createHash('sha256').update(formatted).digest('hex')}`
      );
    },
  });
}
