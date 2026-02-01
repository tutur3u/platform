import { createClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { validate } from 'uuid';

interface CopyBoardRequest {
  targetWorkspaceId: string;
  newBoardName?: string;
}

interface Params {
  params: Promise<{
    wsId: string;
    boardId: string;
  }>;
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { wsId, boardId } = await params;
    const { targetWorkspaceId, newBoardName }: CopyBoardRequest =
      await req.json();

    if (!validate(wsId) || !validate(boardId) || !validate(targetWorkspaceId)) {
      return NextResponse.json(
        { error: 'Invalid workspace ID or board ID' },
        { status: 400 }
      );
    }

    // Hard lock: copying boards across workspaces is not allowed (UI should not expose it).
    // This enforces the rule server-side as well.
    if (targetWorkspaceId !== wsId) {
      return NextResponse.json(
        { error: 'Copying boards to another workspace is not allowed' },
        { status: 403 }
      );
    }

    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Please sign in to copy boards' },
        { status: 401 }
      );
    }

    // Verify user has access to both workspaces
    const [sourceWorkspaceCheck, targetWorkspaceCheck] = await Promise.all([
      supabase
        .from('workspace_members')
        .select('user_id')
        .eq('ws_id', wsId)
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('workspace_members')
        .select('user_id')
        .eq('ws_id', targetWorkspaceId)
        .eq('user_id', user.id)
        .single(),
    ]);

    if (!sourceWorkspaceCheck.data || !targetWorkspaceCheck.data) {
      return NextResponse.json(
        { error: "You don't have access to one or both workspaces" },
        { status: 403 }
      );
    }

    // Check if user has permission to manage projects in the target workspace
    // For simplicity, we'll allow all workspace members to copy boards
    // You can add more granular permission checks here based on the role

    // Fetch the source board with all its lists and tasks
    const { data: sourceBoard, error: fetchError } = await supabase
      .from('workspace_boards')
      .select(`
        *,
        task_lists!board_id (
          id,
          name,
          archived,
          deleted,
          created_at,
          creator_id,
          status,
          color,
          position,
          tasks!list_id (
            id,
            name,
            description,
            closed_at,
            deleted_at,
            completed,
            priority,
            start_date,
            end_date,
            created_at,
            creator_id
          )
        )
      `)
      .eq('id', boardId)
      .eq('ws_id', wsId)
      .is('deleted_at', null)
      .single();

    if (fetchError || !sourceBoard) {
      console.error('Failed to fetch source board:', fetchError);
      return NextResponse.json(
        { error: 'Board not found or access denied' },
        { status: 404 }
      );
    }

    console.log(
      `Fetched board "${sourceBoard.name}" with ${sourceBoard.task_lists?.length || 0} lists`
    );
    sourceBoard.task_lists?.forEach((list, index) => {
      console.log(
        `  List ${index + 1}: ${list.name} (${list.status}) - ${list.tasks?.length || 0} tasks`
      );
    });

    // Create the new board in the target workspace
    const newBoard = {
      name: newBoardName || `${sourceBoard.name} (Copy)`,
      ws_id: targetWorkspaceId,
      creator_id: user.id,
      archived_at: null,
      deleted_at: null,
      created_at: new Date().toISOString(),
      template_id: sourceBoard.template_id,
      icon: sourceBoard.icon ?? null,
    };

    const { data: createdBoard, error: boardError } = await supabase
      .from('workspace_boards')
      .insert(newBoard)
      .select('id')
      .single();

    if (boardError || !createdBoard) {
      throw new Error(`Failed to create board: ${boardError?.message}`);
    }

    const newBoardId = createdBoard.id;

    // Delete any auto-created lists to avoid conflicts with copied lists
    const { error: deleteError } = await supabase
      .from('task_lists')
      .delete()
      .eq('board_id', newBoardId);

    if (deleteError) {
      console.warn(
        'Warning: Could not delete auto-created lists:',
        deleteError
      );
    } else {
      console.log('Deleted auto-created lists to prevent conflicts');
    }

    // Copy task lists
    if (sourceBoard.task_lists && sourceBoard.task_lists.length > 0) {
      const nonDeletedLists = sourceBoard.task_lists.filter(
        (list) => !list.deleted
      );
      console.log(
        `Found ${nonDeletedLists.length} lists to copy from original board`
      );

      // Handle database constraint: only one closed list is allowed per board
      let hasClosedList = false;
      const listsToCreate = nonDeletedLists.map((list) => {
        let status = list.status;

        // If this is a closed list but we already have one, convert it to 'done' status
        if (list.status === 'closed') {
          if (hasClosedList) {
            console.log(
              `Converting additional closed list "${list.name}" to 'done' status due to constraint`
            );
            status = 'done';
          } else {
            hasClosedList = true;
          }
        }

        return {
          name: list.name,
          board_id: newBoardId,
          creator_id: user.id,
          status: status,
          color: list.color,
          position: list.position,
          archived: list.archived || false,
          deleted: false,
          created_at: new Date().toISOString(),
        };
      });

      const { data: createdLists, error: listsError } = await supabase
        .from('task_lists')
        .insert(listsToCreate)
        .select('id, name, status, color, position');

      if (listsError || !createdLists) {
        console.error('List creation error:', listsError);
        throw new Error(`Failed to create task lists: ${listsError?.message}`);
      }

      console.log(`Successfully created ${createdLists.length} lists`);

      // Create a mapping from old list IDs to new list IDs
      const listIdMap = new Map<string, string>();
      nonDeletedLists.forEach((originalList, index) => {
        if (createdLists[index]) {
          listIdMap.set(originalList.id, createdLists[index].id);
          console.log(
            `Mapped list ${originalList.name} (${originalList.id}) -> ${createdLists[index].id}`
          );
        }
      });

      // Copy tasks for each list
      const allTasksToCreate = [];
      for (const originalList of nonDeletedLists) {
        if (!originalList.tasks || originalList.tasks.length === 0) {
          console.log(`List ${originalList.name} has no tasks to copy`);
          continue;
        }

        const newListId = listIdMap.get(originalList.id);
        if (!newListId) {
          console.log(
            `No mapping found for list ${originalList.name} (${originalList.id})`
          );
          continue;
        }

        const validTasks = originalList.tasks.filter(
          (task) => !task.deleted_at
        );
        console.log(
          `Processing ${validTasks.length} tasks from list ${originalList.name}`
        );

        const tasksToCreate = validTasks.map((task) => ({
          name: task.name,
          description: task.description || null,
          list_id: newListId,
          priority: task.priority || null,
          start_date: task.start_date || null,
          end_date: task.end_date || null,
          closed_at: task.closed_at || null,
          deleted_at: null,
          completed: task.completed || false,
          created_at: new Date().toISOString(),
          creator_id: user.id,
        }));

        allTasksToCreate.push(...tasksToCreate);
      }

      // Insert all tasks at once
      if (allTasksToCreate.length > 0) {
        console.log(`Attempting to insert ${allTasksToCreate.length} tasks`);
        const { data: createdTasks, error: tasksError } = await supabase
          .from('tasks')
          .insert(allTasksToCreate)
          .select('id, name');

        if (tasksError) {
          console.error('Task insertion error:', tasksError);
          throw new Error(`Failed to create tasks: ${tasksError.message}`);
        }

        console.log(`Successfully created ${createdTasks?.length || 0} tasks`);
      } else {
        console.log('No tasks to copy');
      }
    }

    // Create success message with status conversion info if applicable
    let message = 'Board copied successfully';
    let hasStatusConversions = false;

    if (sourceBoard.task_lists) {
      const closedLists = sourceBoard.task_lists.filter(
        (list) => !list.deleted && list.status === 'closed'
      );
      if (closedLists.length > 1) {
        hasStatusConversions = true;
        message += `. Note: ${closedLists.length - 1} additional closed list${closedLists.length > 2 ? 's were' : ' was'} converted to 'done' status due to database constraints.`;
      }
    }

    return NextResponse.json({
      success: true,
      message,
      boardId: newBoardId,
      boardName: newBoard.name,
      hasStatusConversions,
    });
  } catch (error) {
    console.error('Error copying board:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
