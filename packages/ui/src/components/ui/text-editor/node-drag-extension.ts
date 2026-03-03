import type { Command } from '@tiptap/core';
import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode, Schema } from '@tiptap/pm/model';
import { Fragment, type ResolvedPos } from '@tiptap/pm/model';
import type { DropZone } from './draggable-node-container';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    nodeDrag: {
      moveNodeToPosition: (options: {
        sourcePos: number;
        targetPos: number;
        dropZone: DropZone;
      }) => ReturnType;
    };
    listItemDrag: {
      moveListItemToPosition: (options: {
        sourcePos: number;
        targetPos: number;
        dropZone: DropZone;
      }) => ReturnType;
    };
  }
}

function isAncestorOf($source: ResolvedPos, $target: ResolvedPos): boolean {
  if ($target.depth <= $source.depth) {
    return false;
  }

  const sourceNodePos = $source.before($source.depth);

  for (let depth = $target.depth; depth > $source.depth; depth--) {
    const ancestorPos = $target.before(depth);

    if (ancestorPos === sourceNodePos) {
      return true;
    }
  }

  return false;
}

function getParentListType($pos: ResolvedPos): string {
  for (let depth = $pos.depth; depth >= 0; depth--) {
    const node = $pos.node(depth);
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

function isListItemNode(node: ProseMirrorNode): boolean {
  return node.type.name === 'listItem' || node.type.name === 'taskItem';
}

function canMoveAcrossSameParent($source: ResolvedPos, $target: ResolvedPos) {
  const sourceParentDepth = Math.max(0, $source.depth - 1);
  const targetParentDepth = Math.max(0, $target.depth - 1);

  const sourceParent = $source.node(sourceParentDepth);
  const targetParent = $target.node(targetParentDepth);

  const sourceParentPos =
    sourceParentDepth > 0 ? $source.before(sourceParentDepth) : 0;
  const targetParentPos =
    targetParentDepth > 0 ? $target.before(targetParentDepth) : 0;

  return (
    sourceParent.type.name === targetParent.type.name &&
    sourceParentPos === targetParentPos
  );
}

function convertNodeToListType(
  node: ProseMirrorNode,
  targetListType: string,
  schema: Schema
): ProseMirrorNode {
  const targetItemType =
    targetListType === 'taskList'
      ? schema.nodes.taskItem
      : schema.nodes.listItem;

  const targetListNodeType = schema.nodes[targetListType];

  if (node.type.name === 'listItem' || node.type.name === 'taskItem') {
    if (!targetItemType) return node;

    const convertedChildren: ProseMirrorNode[] = [];
    node.forEach((child) => {
      convertedChildren.push(
        convertNodeToListType(child, targetListType, schema)
      );
    });

    const attrs =
      targetItemType === schema.nodes.taskItem
        ? { checked: node.attrs.checked ?? false }
        : {};

    return targetItemType.create(attrs, Fragment.from(convertedChildren));
  }

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

  return node;
}

export const NodeDrag = Extension.create({
  name: 'nodeDrag',

  addCommands() {
    const runMoveCommand =
      (options: {
        sourcePos: number;
        targetPos: number;
        dropZone: DropZone;
      }): Command =>
      ({ state, dispatch }) => {
        const { doc, schema } = state;
        const { sourcePos, targetPos, dropZone } = options;

        const sourceNode = doc.nodeAt(sourcePos);
        const targetNode = doc.nodeAt(targetPos);

        if (!sourceNode || !targetNode) {
          return false;
        }

        const sourceStart = sourcePos;
        const sourceEnd = sourcePos + sourceNode.nodeSize;
        const targetStart = targetPos;
        const targetEnd = targetPos + targetNode.nodeSize;

        if (sourceStart === targetStart) {
          return false;
        }

        const $source = doc.resolve(sourcePos + 1);
        const $target = doc.resolve(targetPos + 1);

        if (isAncestorOf($source, $target)) {
          return false;
        }

        const sourceIsListItem = isListItemNode(sourceNode);
        const targetIsListItem = isListItemNode(targetNode);

        let effectiveDropZone = dropZone;
        if (
          effectiveDropZone === 'nested' &&
          (!sourceIsListItem || !targetIsListItem)
        ) {
          effectiveDropZone = 'after';
        }

        if (
          !sourceIsListItem &&
          !targetIsListItem &&
          !canMoveAcrossSameParent($source, $target)
        ) {
          return false;
        }

        const targetListType = getParentListType($target);
        const sourceListType = getParentListType($source);

        let nodeToInsert = sourceNode;
        if (
          sourceIsListItem &&
          targetIsListItem &&
          sourceListType !== targetListType
        ) {
          nodeToInsert = convertNodeToListType(
            sourceNode,
            targetListType,
            schema
          );
        }

        if (!dispatch) {
          return true;
        }

        const tr = state.tr;
        let insertPos: number;

        switch (effectiveDropZone) {
          case 'before':
            insertPos = targetStart;
            break;
          case 'after':
            insertPos = targetEnd;
            break;
          case 'nested': {
            let hasNestedList = false;
            let nestedListPos = -1;

            targetNode.forEach((child, offset) => {
              if (
                child.type.name === 'bulletList' ||
                child.type.name === 'orderedList' ||
                child.type.name === 'taskList'
              ) {
                hasNestedList = true;
                nestedListPos = targetStart + 1 + offset + 1;
              }
            });

            if (hasNestedList && nestedListPos > 0) {
              insertPos = nestedListPos;
              break;
            }

            const listType = schema.nodes[targetListType];
            if (listType) {
              const wrappedNode = listType.create(null, nodeToInsert);
              const insertAtEndOfTarget = targetEnd - 1;

              try {
                if (sourceStart < insertAtEndOfTarget) {
                  tr.delete(sourceStart, sourceEnd);
                  const adjustedInsertPos =
                    insertAtEndOfTarget - (sourceEnd - sourceStart);
                  tr.insert(adjustedInsertPos, wrappedNode);
                } else {
                  tr.insert(insertAtEndOfTarget, wrappedNode);
                  tr.delete(
                    sourceStart + wrappedNode.nodeSize,
                    sourceEnd + wrappedNode.nodeSize
                  );
                }

                dispatch(tr);
                return true;
              } catch {
                return false;
              }
            }

            insertPos = targetEnd;
            break;
          }
          default:
            insertPos = targetEnd;
        }

        try {
          if (sourceStart < insertPos) {
            tr.delete(sourceStart, sourceEnd);
            const adjustedInsertPos = insertPos - (sourceEnd - sourceStart);
            tr.insert(adjustedInsertPos, nodeToInsert);
          } else {
            tr.insert(insertPos, nodeToInsert);
            const adjustedSourceStart = sourceStart + nodeToInsert.nodeSize;
            const adjustedSourceEnd = sourceEnd + nodeToInsert.nodeSize;
            tr.delete(adjustedSourceStart, adjustedSourceEnd);
          }

          dispatch(tr);
          return true;
        } catch {
          return false;
        }
      };

    return {
      moveNodeToPosition: runMoveCommand,
      moveListItemToPosition: (options: {
        sourcePos: number;
        targetPos: number;
        dropZone: DropZone;
      }): Command => runMoveCommand(options),
    };
  },
});
