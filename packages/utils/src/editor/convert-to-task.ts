import type { Editor } from '@tiptap/core';

export interface ConvertToTaskOptions {
  editor: Editor;
  listId: string;
  listName: string;
  createTask: (params: {
    name: string;
    listId: string;
  }) => Promise<{ id: string; name: string }>;
  wrapInParagraph?: boolean;
}

export interface ConvertToTaskResult {
  success: boolean;
  taskId?: string;
  taskName?: string;
  error?: {
    type: 'not_in_list' | 'empty_content' | 'no_lists' | 'unknown';
    message: string;
    description?: string;
  };
}

/**
 * Converts a list item in a TipTap editor to a task and replaces it with a mention.
 *
 * This function:
 * 1. Validates that the cursor is in a list item
 * 2. Extracts the text content from the list item
 * 3. Creates a new task with the extracted text
 * 4. Replaces the list item with a mention to the new task
 *
 * @param options - Configuration options for the conversion
 * @returns Result object indicating success or failure with error details
 */
export async function convertListItemToTask(
  options: ConvertToTaskOptions
): Promise<ConvertToTaskResult> {
  const { editor, listId, listName, createTask, wrapInParagraph = false } = options;

  const { state } = editor;
  const { selection } = state;
  const { $from } = selection;

  // Get the current node (could be listItem, taskItem, or paragraph inside them)
  let currentNode = $from.parent;
  const depth = $from.depth;

  // Safety check: depth must be at least 1 to have a valid position
  if (depth < 1) {
    return {
      success: false,
      error: {
        type: 'not_in_list',
        message: 'Not in a list item',
        description: 'Move your cursor to a list item to convert it to a task',
      },
    };
  }

  let nodePos = $from.before(depth);

  // If we're inside a paragraph, get the parent list item
  if (currentNode.type.name === 'paragraph') {
    if (depth < 2) {
      return {
        success: false,
        error: {
          type: 'not_in_list',
          message: 'Not in a list item',
          description: 'Move your cursor to a list item to convert it to a task',
        },
      };
    }
    currentNode = $from.node(depth - 1);
    nodePos = $from.before(depth - 1);
  }

  // Check if we're in a list item or task item
  const validNodeTypes = ['listItem', 'taskItem'];
  if (!validNodeTypes.includes(currentNode.type.name)) {
    return {
      success: false,
      error: {
        type: 'not_in_list',
        message: 'Not in a list item',
        description: 'Move your cursor to a list item to convert it to a task',
      },
    };
  }

  // Extract text content from the node
  const textContent = currentNode.textContent.trim();
  if (!textContent) {
    return {
      success: false,
      error: {
        type: 'empty_content',
        message: 'Empty list item',
        description: 'Add some text before converting to a task',
      },
    };
  }

  try {
    // Create new task using the provided function
    const newTask = await createTask({
      name: textContent,
      listId,
    });

    // Replace the list item with a mention to the new task
    const tr = state.tr;

    // Delete the list item node
    tr.delete(nodePos, nodePos + currentNode.nodeSize);

    // Check if mention node exists in schema
    if (state.schema.nodes.mention) {
      // Create mention node
      const mentionNode = state.schema.nodes.mention.create({
        entityId: newTask.id,
        entityType: 'task',
        displayName: newTask.name,
        avatarUrl: null,
        subtitle: listName,
      });

      // Wrap in paragraph if requested and paragraph node exists
      if (wrapInParagraph && state.schema.nodes.paragraph) {
        const paragraphNode = state.schema.nodes.paragraph.create(null, [
          mentionNode,
          state.schema.text(' '),
        ]);
        tr.insert(nodePos, paragraphNode);
      } else {
        tr.insert(nodePos, mentionNode);
      }
    }

    // Apply transaction
    editor.view.dispatch(tr);

    return {
      success: true,
      taskId: newTask.id,
      taskName: newTask.name,
    };
  } catch (error) {
    console.error('Failed to convert item to task:', error);
    return {
      success: false,
      error: {
        type: 'unknown',
        message: 'Failed to create task',
        description: 'An error occurred while creating the task',
      },
    };
  }
}
