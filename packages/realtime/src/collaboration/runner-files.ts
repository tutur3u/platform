import * as Y from 'yjs';
import {
  programmingDocumentSnapshot,
  replaceProgrammingText,
} from './document';

/** Merge the runner's changes against its own last snapshot, retaining editor-only changes. */
export function mergeRunnerFiles(
  doc: Y.Doc,
  baseline: Record<string, string>,
  changed: { path: string; content: string }[],
  paths: string[],
  hash: (content: string) => string
) {
  const current = new Map(
    programmingDocumentSnapshot(doc).files.map((file) => [
      file.path,
      file.content,
    ])
  );
  const inventory = new Set(paths);
  const hashes: Record<string, string> = Object.create(null);
  for (const path of paths) {
    if (Object.hasOwn(baseline, path)) hashes[path] = baseline[path]!;
  }
  const writes = new Map<string, string>();
  const deletions: string[] = [];
  for (const file of changed) {
    if (!inventory.has(file.path)) throw new Error('Invalid runner inventory');
    const nextHash = hash(file.content);
    const previousHash = current.has(file.path)
      ? hash(current.get(file.path)!)
      : undefined;
    const baselineHash = Object.hasOwn(baseline, file.path)
      ? baseline[file.path]
      : undefined;
    if (previousHash !== nextHash && previousHash !== baselineHash)
      throw new Error('Runner and editor changed the same file');
    writes.set(file.path, file.content);
    hashes[file.path] = nextHash;
  }
  for (const path of Object.keys(baseline)) {
    if (inventory.has(path) || !current.has(path)) continue;
    if (hash(current.get(path)!) !== baseline[path])
      throw new Error('Runner deletion conflicts with editor changes');
    deletions.push(path);
  }
  if (paths.some((path) => !hashes[path]))
    throw new Error('Missing runner file bytes');
  const vector = Y.encodeStateVector(doc);
  doc.transact(() => {
    const files = doc.getMap<Y.Text>('files');
    for (const path of deletions) files.delete(path);
    for (const [path, content] of writes) {
      let text = files.get(path);
      if (!text) {
        text = new Y.Text();
        files.set(path, text);
      }
      replaceProgrammingText(text, content, 'runner');
    }
  }, 'runner');
  return { hashes, update: Y.encodeStateAsUpdate(doc, vector) };
}
