import {
  createProgrammingDocument,
  programmingDocumentSnapshot,
  Y,
} from '@tuturuuu/realtime/collaboration/server';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMiraFixUpdate, miraCodeExcerpt } from './programming-mira-fix';

const range = { filePath: 'solution.py', startLine: 2, endLine: 2 };
test('patches the exact Yjs range and preserves the other lines', () => {
  const doc = createProgrammingDocument(
    [{ path: range.filePath, content: 'a\nb\nc' }],
    ''
  );
  const excerpt = miraCodeExcerpt(doc, range)!;
  const result = buildMiraFixUpdate(doc, {
    ...excerpt,
    action: 'resolve',
    id: 'fixture',
    decision: 'accepted',
    range,
    replacement: 'x\ny',
  });
  assert.ok(result);
  Y.applyUpdate(doc, result.update);
  assert.equal(
    programmingDocumentSnapshot(doc).files[0]?.content,
    'a\nx\ny\nc'
  );
  doc.destroy();
});
test('rejects stale fixes after a concurrent source edit', () => {
  const doc = createProgrammingDocument(
    [{ path: range.filePath, content: 'a\nb\nc' }],
    ''
  );
  const excerpt = miraCodeExcerpt(doc, range)!;
  doc
    .getMap<Y.Text>('files')
    .get(range.filePath)!
    .insert(0, '# concurrent edit\n');
  assert.equal(
    buildMiraFixUpdate(doc, {
      ...excerpt,
      action: 'resolve',
      id: 'fixture',
      decision: 'accepted',
      range,
      replacement: 'x',
    }),
    null
  );
  doc.destroy();
});
