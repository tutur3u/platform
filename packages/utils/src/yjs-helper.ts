import { Node, type Schema } from 'prosemirror-model';
import { prosemirrorToYXmlFragment, yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror';
import * as Y from 'yjs';
import type { JSONContent } from '@tiptap/react';

export function convertJsonContentToYjsState(
  jsonContent: JSONContent, 
  schema: Schema
): Uint8Array {
  const ydoc = new Y.Doc();
  const fragment = ydoc.getXmlFragment('prosemirror');
  
  // Convert JSONContent → ProseMirror Node
  const node = Node.fromJSON(schema, jsonContent);
  
  // Convert ProseMirror Node → Yjs Fragment
  prosemirrorToYXmlFragment(node, fragment);
  
  // Encode Y.Doc to Uint8Array
  return Y.encodeStateAsUpdate(ydoc);
};

export function convertYjsStateToJsonContent(
    yjsState: Uint8Array,
    schema: Schema
  ): JSONContent {
    // Create Y.Doc from state
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, yjsState);
    
    // Get fragment
    const fragment = ydoc.getXmlFragment('prosemirror');
    
    // Convert Yjs Fragment → ProseMirror Node
    const node = yXmlFragmentToProseMirrorRootNode(fragment, schema);
    
    // Convert ProseMirror Node → JSONContent
    return node.toJSON();
  }