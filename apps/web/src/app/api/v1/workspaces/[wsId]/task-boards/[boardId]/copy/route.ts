import { createClient } from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const paramsSchema = z.object({
  wsId: z.string().uuid(),
  boardId: z.string().uuid(),
});

const copySchema = z.object({
  targetWorkspaceId: z.string().uuid(),
  newBoardName: z.string().trim().min(1).max(255).optional(),
});

interface Params {
  params: Promise<{
    wsId: string;
    boardId: string;
  }>;
}

export async function POST(req: Request, { params }: Params) {
  try {
    const { wsId, boardId } = paramsSchema.parse(await params);
    const { targetWorkspaceId, newBoardName } = copySchema.parse(
      await req.json()
    );
    const supabase = await createClient(req);

    if (targetWorkspaceId !== wsId) {
      return NextResponse.json(
        { error: 'Copying boards to another workspace is not allowed' },
        { status: 403 }
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: member } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!member) {
      return NextResponse.json(
        { error: "You don't have access to this workspace" },
        { status: 403 }
      );
    }

    const { data: sourceBoard, error: fetchError } = await supabase
      .from('workspace_boards')
      .select(
        `
        *,
        task_lists!board_id (
          id,
          name,
          archived,
          deleted,
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
            end_date
          )
        )
      `
      )
      .eq('id', boardId)
      .eq('ws_id', wsId)
      .is('deleted_at', null)
      .single();

    if (fetchError || !sourceBoard) {
      return NextResponse.json(
        { error: 'Board not found or access denied' },
        { status: 404 }
      );
    }

    const newBoardPayload: Database['public']['Tables']['workspace_boards']['Insert'] =
      {
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
      .insert(newBoardPayload)
      .select('id, name')
      .single();

    if (boardError || !createdBoard) {
      return NextResponse.json(
        { error: 'Failed to create board copy' },
        { status: 500 }
      );
    }

    const newBoardId = createdBoard.id;

    await supabase.from('task_lists').delete().eq('board_id', newBoardId);

    if (sourceBoard.task_lists && sourceBoard.task_lists.length > 0) {
      const nonDeletedLists = sourceBoard.task_lists.filter(
        (list) => !list.deleted
      );

      let hasClosedList = false;
      const listsToCreate = nonDeletedLists.map((list) => {
        let status = list.status;
        if (list.status === 'closed') {
          if (hasClosedList) {
            status = 'done';
          } else {
            hasClosedList = true;
          }
        }

        return {
          name: list.name,
          board_id: newBoardId,
          creator_id: user.id,
          status,
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
        .select('id');

      if (listsError || !createdLists) {
        return NextResponse.json(
          { error: 'Failed to create copied lists' },
          { status: 500 }
        );
      }

      const listIdMap = new Map<string, string>();
      nonDeletedLists.forEach((original, index) => {
        const copied = createdLists[index];
        if (copied) {
          listIdMap.set(original.id, copied.id);
        }
      });

      const tasksToCreate = nonDeletedLists.flatMap((originalList) => {
        const newListId = listIdMap.get(originalList.id);
        if (!newListId) return [];

        return (originalList.tasks || [])
          .filter((task) => !task.deleted_at)
          .map((task) => ({
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
      });

      if (tasksToCreate.length > 0) {
        const { error: tasksError } = await supabase
          .from('tasks')
          .insert(tasksToCreate);
        if (tasksError) {
          return NextResponse.json(
            { error: 'Failed to create copied tasks' },
            { status: 500 }
          );
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Board copied successfully',
      boardId: newBoardId,
      boardName: createdBoard.name,
    });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
