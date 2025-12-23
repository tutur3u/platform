import type { Command } from '@tiptap/core';
import { Extension } from '@tiptap/core';
import { ListItem, TaskItem } from '@tiptap/extension-list';
import type { Node as ProseMirrorNode, Schema } from '@tiptap/pm/model';
import { Fragment, type ResolvedPos } from '@tiptap/pm/model';
import { ReactNodeViewRenderer } from '@tiptap/react';
import {
  type DropZone,
  ListItemView,
  TaskItemView,
} from './draggable-list-item';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    listItemDrag: {
      /**
       * Move list item from source position to target position (used by drag-and-drop)
       */
      moveListItemToPosition: (options: {
        sourcePos: number;
        targetPos: number;
        dropZone: DropZone;
      }) => ReturnType;
    };
  }
}

/**
 * Custom ListItem extension with drag handle support.
 */
export const DraggableListItem = ListItem.extend({
  draggable: true,

  addNodeView() {
    return ReactNodeViewRenderer(ListItemView);
  },
});

/**
 * Custom TaskItem extension with drag handle support.
 */
export const DraggableTaskItem = TaskItem.extend({
  draggable: true,

  addNodeView() {
    return ReactNodeViewRenderer(TaskItemView);
  },
});

// ============================================================================
// Tree Utility Functions
// ============================================================================

/**
 * Check if source node is an ancestor of target node (for circular prevention).
 * Returns true if moving source to target would create a circular reference.
 *
 * @param $source - Resolved position inside the source node
 * @param $target - Resolved position inside the target node
 */
function isAncestorOf($source: ResolvedPos, $target: ResolvedPos): boolean {
  // Quick check: if target is shallower or at same depth, it can't be a descendant
  if ($target.depth <= $source.depth) {
    return false;
  }

  // Get the position before the source node (the node's start position)
  const sourceNodePos = $source.before($source.depth);

  // Traverse up from target to check if source is an ancestor
  // Start from target's depth and go up to source's depth
  for (let depth = $target.depth; depth > $source.depth; depth--) {
    const ancestorPos = $target.before(depth);

    // Check if this ancestor position matches the source node position
    if (ancestorPos === sourceNodePos) {
      return true;
    }
  }

  return false;
}

/**
 * Get the list type name at a given resolved position.
 */
function getParentListType($pos: ResolvedPos): string {
  for (let d = $pos.depth; d >= 0; d--) {
    const node = $pos.node(d);
    if (
      node.type.name === 'bulletList' ||
      node.type.name === 'orderedList' ||
      node.type.name === 'taskList'
    ) {
      return node.type.name;
    }
  }
  return 'bulletList';
}

/**
 * Recursively convert a list item (and any nested lists) to the target list type.
 */
function convertNodeToListType(
  node: ProseMirrorNode,
  targetListType: string,
  schema: Schema
): ProseMirrorNode {
  // Determine target item type
  const targetItemType =
    targetListType === 'taskList'
      ? schema.nodes.taskItem
      : schema.nodes.listItem;

  // Determine target list node type
  const targetListNodeType = schema.nodes[targetListType];

  // If this is a list item, convert it
  if (node.type.name === 'listItem' || node.type.name === 'taskItem') {
    if (!targetItemType) return node;

    // Convert children recursively
    const convertedChildren: ProseMirrorNode[] = [];
    node.forEach((child) => {
      convertedChildren.push(
        convertNodeToListType(child, targetListType, schema)
      );
    });

    // Create appropriate attrs for target type
    const attrs =
      targetItemType === schema.nodes.taskItem
        ? { checked: node.attrs.checked ?? false }
        : {};

    return targetItemType.create(attrs, Fragment.from(convertedChildren));
  }

  // If this is a list, convert it and its children
  if (
    node.type.name === 'bulletList' ||
    node.type.name === 'orderedList' ||
    node.type.name === 'taskList'
  ) {
    if (!targetListNodeType) return node;

    const convertedChildren: ProseMirrorNode[] = [];
    node.forEach((child) => {
      convertedChildren.push(
        convertNodeToListType(child, targetListType, schema)
      );
    });

    return targetListNodeType.create(
      node.attrs,
      Fragment.from(convertedChildren)
    );
  }

  // For other nodes (paragraph, etc.), return as-is
  return node;
}

// ============================================================================
// Main Extension
// ============================================================================

/**
 * Extension that adds list item movement commands for drag-and-drop.
 * Works with both regular list items and task items.
 */
export const ListItemDrag = Extension.create({
  name: 'listItemDrag',

  addCommands() {
    return {
      moveListItemToPosition:
        (options: {
          sourcePos: number;
          targetPos: number;
          dropZone: DropZone;
        }): Command =>
        ({ state, dispatch }) => {
          const { doc, schema } = state;
          const { sourcePos, targetPos, dropZone } = options;

          // getPos() returns the position right before the list item node
          // So we can get the node directly with nodeAt()
          const sourceItem = doc.nodeAt(sourcePos);
          const targetItem = doc.nodeAt(targetPos);

          if (!sourceItem || !targetItem) {
            return false;
          }

          // Verify these are actually list items
          if (
            (sourceItem.type.name !== 'listItem' &&
              sourceItem.type.name !== 'taskItem') ||
            (targetItem.type.name !== 'listItem' &&
              targetItem.type.name !== 'taskItem')
          ) {
            return false;
          }

          // Calculate boundaries using node positions and sizes
          const sourceItemStart = sourcePos;
          const sourceItemEnd = sourcePos + sourceItem.nodeSize;
          const targetItemStart = targetPos;
          const targetItemEnd = targetPos + targetItem.nodeSize;

          // Prevent dropping on self
          if (sourceItemStart === targetItemStart) {
            return false;
          }

          // Resolve positions for getting parent list type and checking ancestry
          const $source = doc.resolve(sourcePos + 1); // +1 to be inside the node
          const $target = doc.resolve(targetPos + 1);

          // Prevent circular reference (dropping parent into its own child)
          if (isAncestorOf($source, $target)) {
            return false;
          }

          // Get target list type for potential conversion
          const targetListType = getParentListType($target);

          // Convert the source item if moving between different list types
          const sourceListType = getParentListType($source);
          let itemToInsert = sourceItem;

          if (sourceListType !== targetListType) {
            itemToInsert = convertNodeToListType(
              sourceItem,
              targetListType,
              schema
            );
          }
          if (!dispatch) {
            return true;
          }

          const tr = state.tr;

          // Calculate insertion position based on drop zone
          let insertPos: number;

          switch (dropZone) {
            case 'before':
              // Insert right before the target item
              insertPos = targetItemStart;
              break;

            case 'after':
              // Insert right after the target item
              insertPos = targetItemEnd;
              break;

            case 'nested': {
              // Insert as first child of target item
              // We need to find or create a nested list inside the target item

              // Check if target item already has a nested list
              let hasNestedList = false;
              let nestedListPos = -1;

              targetItem.forEach((child, offset) => {
                if (
                  child.type.name === 'bulletList' ||
                  child.type.name === 'orderedList' ||
                  child.type.name === 'taskList'
                ) {
                  hasNestedList = true;
                  // Position right after the opening tag of the nested list
                  nestedListPos = targetItemStart + 1 + offset + 1;
                }
              });

              if (hasNestedList && nestedListPos > 0) {
                // Insert at the start of existing nested list
                insertPos = nestedListPos;
              } else {
                // Need to create a new nested list
                // Insert at the end of target item content (before closing tag)
                const listType = schema.nodes[targetListType];
                if (listType) {
                  // Wrap the item in a new list
                  const wrappedItem = listType.create(null, itemToInsert);

                  // Calculate where to insert the wrapped list (at end of target item)
                  const insertAtEndOfTarget = targetItemEnd - 1;

                  // Perform the operation: delete source, then insert wrapped list
                  if (sourceItemStart < insertAtEndOfTarget) {
                    tr.delete(sourceItemStart, sourceItemEnd);
                    const adjustedInsertPos =
                      insertAtEndOfTarget - (sourceItemEnd - sourceItemStart);
                    tr.insert(adjustedInsertPos, wrappedItem);
                  } else {
                    tr.insert(insertAtEndOfTarget, wrappedItem);
                    tr.delete(
                      sourceItemStart + wrappedItem.nodeSize,
                      sourceItemEnd + wrappedItem.nodeSize
                    );
                  }

                  dispatch(tr);
                  return true;
                }
                // Fallback: insert after target
                insertPos = targetItemEnd;
              }
              break;
            }

            default:
              insertPos = targetItemEnd;
          }

          // Perform the move operation with proper position adjustment
          if (sourceItemStart < insertPos) {
            // Source is before insertion point
            // Delete source first, then insert at adjusted position
            tr.delete(sourceItemStart, sourceItemEnd);
            const adjustedInsertPos =
              insertPos - (sourceItemEnd - sourceItemStart);
            tr.insert(adjustedInsertPos, itemToInsert);
          } else {
            // Source is after insertion point
            // Insert first, then delete at adjusted position
            tr.insert(insertPos, itemToInsert);
            const adjustedSourceStart = sourceItemStart + itemToInsert.nodeSize;
            const adjustedSourceEnd = sourceItemEnd + itemToInsert.nodeSize;
            tr.delete(adjustedSourceStart, adjustedSourceEnd);
          }

          dispatch(tr);
          return true;
        },
    };
  },
});
