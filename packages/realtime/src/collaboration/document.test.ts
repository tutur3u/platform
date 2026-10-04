import { expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  createProgrammingDocument,
  programmingDocumentSnapshot,
  replaceProgrammingText,
} from './document';

it('merges simultaneous edits and file additions without replacing remote text', () => {
  const a = createProgrammingDocument(
    [{ path: 'main.py', content: 'hello' }],
    'python main.py'
  );
  const b = new Y.Doc();
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  const initial = Y.encodeStateVector(a);
  replaceProgrammingText(
    a.getMap<Y.Text>('files').get('main.py')!,
    'hello world'
  );
  replaceProgrammingText(b.getMap<Y.Text>('files').get('main.py')!, 'Hello');
  b.getMap<Y.Text>('files').set('readme.md', new Y.Text('notes'));
  const left = Y.encodeStateAsUpdate(a, initial);
  const right = Y.encodeStateAsUpdate(b, initial);
  Y.applyUpdate(a, right);
  Y.applyUpdate(b, left);
  expect(programmingDocumentSnapshot(a)).toEqual(
    programmingDocumentSnapshot(b)
  );
  expect(programmingDocumentSnapshot(a).files[0]?.content).toBe('Hello world');
  a.destroy();
  b.destroy();
});
