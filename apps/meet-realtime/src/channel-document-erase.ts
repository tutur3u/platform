import { Y } from '@tuturuuu/realtime/collaboration/server';
import {
  canonicalJson,
  type EraseCommand,
  sha256,
} from '../../../packages/realtime/src/documents/erase';
import { richTextDocumentContent } from '../../../packages/realtime/src/documents/server';
export type PersistedErase = {
  installedGeneration: number;
  freeze: {
    operation_key: string;
    decision: EraseCommand['decision'];
    state_hash: string;
    lease_exp: number;
  } | null;
  appliedOperation: {
    operation_key: string;
    post_state_hash: string;
    post_pm_hash: string;
  } | null;
};
export const emptyErase = (): PersistedErase => ({
  installedGeneration: 0,
  freeze: null,
  appliedOperation: null,
});
export async function documentHashes(doc: Y.Doc) {
  const bytes = Y.encodeStateAsUpdate(doc);
  return {
    post_state_hash: await sha256(bytes),
    post_pm_hash: await sha256(
      new TextEncoder().encode(canonicalJson(richTextDocumentContent(bytes)))
    ),
  };
}
export async function applyDocumentErase(source: Y.Doc, command: EraseCommand) {
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(source));
    const fragment = doc.getXmlFragment('prosemirror');
    const content = richTextDocumentContent(Y.encodeStateAsUpdate(doc));
    const blocks = content.content ?? [];
    for (const block of command.blocks) {
      if (
        !blocks[block.index] ||
        (await sha256(
          new TextEncoder().encode(canonicalJson(blocks[block.index]))
        )) !== block.block_sha256
      )
        throw new Error('Stale block');
    }
    if (command.decision === 'whole') {
      // Delete the existing CRDT items so stale full-state updates remain tombstoned.
      doc.transact((transaction) => {
        for (const root of doc.share.values()) {
          for (let item = root._start; item; item = item.right)
            item.delete(transaction);
          for (const item of root._map.values()) item.delete(transaction);
        }
      });
      for (const structs of doc.store.clients.values()) {
        for (const struct of structs) {
          if (
            !struct.deleted ||
            (struct instanceof Y.Item &&
              !(struct.content instanceof Y.ContentDeleted))
          )
            throw new Error('Erase item GC incomplete');
        }
      }
    } else if (command.decision === 'blocks') {
      const indexes = [...new Set(command.blocks.map((b) => b.index))].sort(
        (a, b) => b - a
      );
      for (const index of indexes) fragment.delete(index, 1);
    } else throw new Error('Leave has no apply');
    const hashes = await documentHashes(doc);
    if (
      command.expected_post_pm_hash &&
      hashes.post_pm_hash !== command.expected_post_pm_hash
    )
      throw new Error('Receipt mismatch');
    return { doc, hashes };
  } catch (error) {
    doc.destroy();
    throw error;
  }
}
