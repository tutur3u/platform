import { splitBlock } from '@tiptap/pm/commands';
import type { EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

const EXTENSION_OWNED_ENTER_NODE_NAMES = new Set(['listItem', 'taskItem']);
const PLAIN_ENTER_FALLBACK_TEXTBLOCK_NAMES = new Set(['paragraph', 'heading']);

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
