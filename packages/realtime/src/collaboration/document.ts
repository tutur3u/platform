import * as Y from 'yjs';
export function createProgrammingDocument(
  files: { path: string; content: string }[],
  command: string
) {
  const doc = new Y.Doc();
  const map = doc.getMap<Y.Text>('files');
  doc.transact(() => {
    for (const file of files) {
      const text = new Y.Text();
      text.insert(0, file.content);
      map.set(file.path, text);
    }
    doc.getText('command').insert(0, command);
  });
  return doc;
}
export function programmingDocumentSnapshot(doc: Y.Doc) {
  return {
    files: Array.from(doc.getMap<Y.Text>('files').entries())
      .map(([path, text]) => {
        if (!(text instanceof Y.Text)) throw new Error('Invalid shared file');
        return { path, content: text.toString() };
      })
      .sort((a, b) => a.path.localeCompare(b.path)),
    command: doc.getText('command').toString(),
  };
}
/** Replace only the differing span, retaining CRDT positions for other participants. */
export function replaceProgrammingText(
  text: Y.Text,
  value: string,
  origin: unknown = 'editor'
) {
  const old = text.toString();
  if (old === value) return;
  let start = 0;
  while (
    start < old.length &&
    start < value.length &&
    old[start] === value[start]
  )
    start++;
  let tail = 0;
  while (
    tail < old.length - start &&
    tail < value.length - start &&
    old[old.length - 1 - tail] === value[value.length - 1 - tail]
  )
    tail++;
  text.doc?.transact(() => {
    text.delete(start, old.length - start - tail);
    text.insert(start, value.slice(start, value.length - tail));
  }, origin);
}
