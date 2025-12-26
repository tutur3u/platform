import type { Editor } from '@tiptap/core';

export interface ConvertToTaskOptions {
  editor: Editor;
  listId: string;
  listName: string;
  createTask: (params: { name: string; listId: string }) => Promise<{
    id: string;
    name: string;
    display_number?: number;
    priority?: string;
    listColor?: string;
    assignees?: string;
  }>;
  wrapInParagraph?: boolean;
}

export interface ConvertToTaskResult {
  success: boolean;
  taskId?: string;
  taskName?: string;
  error?: {
    type: 'no_selection' | 'empty_content' | 'no_lists' | 'unknown';
    message: string;
    description?: string;
  };
}

/**
 * Converts selected text or a list item in a TipTap editor to a task and replaces it with a mention.
 *
 * This function supports two modes:
 * 1. Selection mode: If text is highlighted/selected, uses the selected text as the task name
 *    and replaces the selection with a mention to the new task.
 * 2. List item mode (fallback): If no text is selected but cursor is in a list item,
 *    uses the entire list item text and replaces the list item with a mention.
 *
 * @param options - Configuration options for the conversion
 * @returns Result object indicating success or failure with error details
 */
export async function convertListItemToTask(
  options: ConvertToTaskOptions
): Promise<ConvertToTaskResult> {
  const {
    editor,
    listId,
    listName: _listName, // Kept for backwards compatibility but unused
    createTask,
    wrapInParagraph = false,
  } = options;

  const { state } = editor;
  const { selection } = state;
  const { from, to, empty } = selection;

  // Mode 1: Text is selected - use the selected text as task name
  if (!empty) {
    const selectedText = state.doc.textBetween(from, to, ' ').trim();

    if (!selectedText) {
      return {
        success: false,
        error: {
          type: 'empty_content',
          message: 'Empty selection',
          description: 'Select some text to convert to a task',
        },
      };
    }

    try {
      // Create new task using the selected text
      const newTask = await createTask({
        name: selectedText,
        listId,
      });

      // Replace the selected text with a mention to the new task
      const tr = state.tr;

      // Delete the selected text
      tr.delete(from, to);

      // Check if mention node exists in schema
      if (state.schema.nodes.mention) {
        // Create mention node with correct attributes:
        // - displayName: ticket number (e.g., "123" for #123)
        // - subtitle: task name
        const mentionNode = state.schema.nodes.mention.create({
          entityId: newTask.id,
          entityType: 'task',
          displayName: newTask.display_number
            ? String(newTask.display_number)
            : newTask.name,
          avatarUrl: null,
          subtitle: newTask.name,
          // Add task-specific attributes if present
          priority: newTask.priority || null,
          listColor: newTask.listColor || null,
          assignees: newTask.assignees || null,
        });

        // Insert mention at the selection start position
        tr.insert(from, mentionNode);

        // Add a space after the mention for better UX
        const spacePos = from + mentionNode.nodeSize;
        tr.insertText(' ', spacePos);
      }

      // Apply transaction
      editor.view.dispatch(tr);

      return {
        success: true,
        taskId: newTask.id,
        taskName: newTask.name,
      };
    } catch (error) {
      console.error('Failed to convert selection to task:', error);
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

  // Mode 2: No selection - fall back to list item mode
  const { $from } = selection;

  // Get the current node (could be listItem, taskItem, or paragraph inside them)
  let currentNode = $from.parent;
  const depth = $from.depth;

  // Safety check: depth must be at least 1 to have a valid position
  if (depth < 1) {
    return {
      success: false,
      error: {
        type: 'no_selection',
        message: 'No text selected',
        description:
          'Select some text or move your cursor to a list item to convert it to a task',
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
          type: 'no_selection',
          message: 'No text selected',
          description:
            'Select some text or move your cursor to a list item to convert it to a task',
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
        type: 'no_selection',
        message: 'No text selected',
        description:
          'Select some text or move your cursor to a list item to convert it to a task',
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
      // Create mention node with correct attributes:
      // - displayName: ticket number (e.g., "123" for #123)
      // - subtitle: task name
      const mentionNode = state.schema.nodes.mention.create({
        entityId: newTask.id,
        entityType: 'task',
        displayName: newTask.display_number
          ? String(newTask.display_number)
          : newTask.name,
        avatarUrl: null,
        subtitle: newTask.name,
        // Add task-specific attributes if present
        priority: newTask.priority || null,
        listColor: newTask.listColor || null,
        assignees: newTask.assignees || null,
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
