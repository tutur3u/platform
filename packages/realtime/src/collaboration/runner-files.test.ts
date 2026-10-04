import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type * as Y from 'yjs';
import {
  createProgrammingDocument,
  programmingDocumentSnapshot,
} from './document';
import { mergeRunnerFiles } from './runner-files';

const hash = (content: string) =>
  createHash('sha256').update(content).digest('hex');
const initial = { 'main.py': hash('original'), 'obsolete.txt': hash('old') };

describe('runner files and collaborative edits', () => {
  it('merges generated files and deletions while retaining editor-only files and edits', () => {
    const doc = createProgrammingDocument(
      [
        { path: 'main.py', content: 'editor change' },
        { path: 'obsolete.txt', content: 'old' },
        { path: 'notes.txt', content: 'editor only' },
      ],
      'python main.py'
    );
    try {
      const result = mergeRunnerFiles(
        doc,
        initial,
        [{ path: 'generated.txt', content: 'runner output' }],
        ['main.py', 'generated.txt'],
        hash
      );
      expect(programmingDocumentSnapshot(doc).files).toEqual([
        { path: 'generated.txt', content: 'runner output' },
        { path: 'main.py', content: 'editor change' },
        { path: 'notes.txt', content: 'editor only' },
      ]);
      expect(result.hashes).toEqual({
        'main.py': initial['main.py'],
        'generated.txt': hash('runner output'),
      });
    } finally {
      doc.destroy();
    }
  });
  it.each(['write', 'delete'])(
    'rejects conflicting %s before applying any changes',
    (operation) => {
      const doc = createProgrammingDocument(
        [{ path: 'main.py', content: 'editor change' }],
        'python main.py'
      );
      try {
        const before = programmingDocumentSnapshot(doc);
        expect(() =>
          mergeRunnerFiles(
            doc,
            { 'main.py': initial['main.py']! },
            [
              { path: 'generated.txt', content: 'output' },
              ...(operation === 'write'
                ? [{ path: 'main.py', content: 'runner change' }]
                : []),
            ],
            operation === 'write'
              ? ['generated.txt', 'main.py']
              : ['generated.txt'],
            hash
          )
        ).toThrow(/conflict|same file/);
        expect(programmingDocumentSnapshot(doc)).toEqual(before);
      } finally {
        doc.destroy();
      }
    }
  );
  it('accepts a retry of a previously applied export without overwriting a later editor change', () => {
    const doc = createProgrammingDocument(
      [{ path: 'main.py', content: 'original' }],
      'python main.py'
    );
    try {
      const exportFiles = [{ path: 'main.py', content: 'runner change' }];
      const result = mergeRunnerFiles(
        doc,
        { 'main.py': initial['main.py']! },
        exportFiles,
        ['main.py'],
        hash
      );
      expect(() =>
        mergeRunnerFiles(doc, result.hashes, exportFiles, ['main.py'], hash)
      ).not.toThrow();
      doc.getMap<Y.Text>('files').get('main.py')!.insert(0, 'editor ');
      expect(() =>
        mergeRunnerFiles(doc, result.hashes, exportFiles, ['main.py'], hash)
      ).toThrow('same file');
      expect(programmingDocumentSnapshot(doc).files[0]?.content).toBe(
        'editor runner change'
      );
    } finally {
      doc.destroy();
    }
  });
  it('rejects unknown unchanged files with missing bytes without changing the document', () => {
    const doc = createProgrammingDocument([], '');
    try {
      expect(() =>
        mergeRunnerFiles(
          doc,
          {},
          [{ path: 'ok.txt', content: 'ok' }],
          ['ok.txt', 'missing.txt'],
          hash
        )
      ).toThrow('Missing');
      expect(programmingDocumentSnapshot(doc).files).toEqual([]);
    } finally {
      doc.destroy();
    }
  });
});

it('treats prototype-like filenames as ordinary own keys, never inherited inventory', () => {
  const doc = createProgrammingDocument([], '');
  try {
    expect(() => mergeRunnerFiles(doc, {}, [], ['constructor'], hash)).toThrow(
      'Missing'
    );
    const changed = [{ path: '__proto__', content: 'file content' }];
    const result = mergeRunnerFiles(doc, {}, changed, ['__proto__'], hash);
    expect(Object.hasOwn(result.hashes, '__proto__')).toBe(true);
    const filename = '__proto__';
    expect(JSON.parse(JSON.stringify(result.hashes))[filename]).toBe(
      hash('file content')
    );
    expect(() =>
      mergeRunnerFiles(doc, result.hashes, changed, ['__proto__'], hash)
    ).not.toThrow();
  } finally {
    doc.destroy();
  }
});
