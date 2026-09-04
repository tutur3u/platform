import { splitBlock } from '@tiptap/pm/commands';
import { liftListItem, sinkListItem } from '@tiptap/pm/schema-list';
import type { EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

const EXTENSION_OWNED_ENTER_NODE_NAMES = new Set(['listItem', 'taskItem']);
const PLAIN_ENTER_FALLBACK_TEXTBLOCK_NAMES = new Set(['paragraph', 'heading']);
const INDENTABLE_LIST_ITEM_NAMES = new Set(['listItem', 'taskItem']);

function findAncestorNodeName(
  state: EditorState,
  nodeNames: ReadonlySet<string>
): string | null {
  const { $from } = state.selection;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const name = $from.node(depth).type.name;
    if (nodeNames.has(name)) return name;
  }

  return null;
}

export function isSelectionInsideNode(
  state: EditorState,
  nodeNames: ReadonlySet<string>
): boolean {
  const { $from } = state.selection;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if (nodeNames.has($from.node(depth).type.name)) {
      return true;
    }
  }

  return false;
}

export function shouldRunPlainEnterFallback(
  state: EditorState,
  event: KeyboardEvent
): boolean {
  if (event.key !== 'Enter') return false;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return false;
  }

  if (
    !PLAIN_ENTER_FALLBACK_TEXTBLOCK_NAMES.has(
      state.selection.$from.parent.type.name
    )
  ) {
    return false;
  }

  return !isSelectionInsideNode(state, EXTENSION_OWNED_ENTER_NODE_NAMES);
}

export function handlePlainEnterFallback(
  view: EditorView,
  event: KeyboardEvent
): boolean {
  if (!shouldRunPlainEnterFallback(view.state, event)) {
    return false;
  }

  const didSplit = splitBlock(view.state, view.dispatch.bind(view), view);

  if (didSplit) {
    event.preventDefault();
  }

  return didSplit;
}

/**
 * Indent list items without reaching through a React closure for the editor.
 * The DOM view is the source of truth at keydown time, including for editors
 * that were just mounted or rebound to a collaboration document.
 */
export function handleListIndentation(
  view: EditorView,
  event: KeyboardEvent
): boolean {
  if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) {
    return false;
  }

  const itemName = findAncestorNodeName(view.state, INDENTABLE_LIST_ITEM_NAMES);
  if (!itemName) return false;

  const itemType = view.state.schema.nodes[itemName];
  if (!itemType) return false;

  const command = event.shiftKey
    ? liftListItem(itemType)
    : sinkListItem(itemType);
  const handled = command(view.state, view.dispatch.bind(view), view);

  if (!handled) return false;

  event.preventDefault();
  event.stopPropagation();
  return true;
}
