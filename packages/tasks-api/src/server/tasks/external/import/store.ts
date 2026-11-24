import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { resolveCreateTaskSortKey } from '../../create-sort-key';
import { insertWorkspaceTask } from '../../insert-workspace-task';
import type { ExistingRef, ImportStore } from './store-types';

export type * from './store-types';

function fail(label: string, error: unknown): never {
  console.error(`Import store failure (${label}):`, error);
  throw new Error(`${label} failed`);
}

const LABEL_COLOR = '#24292f';

export function createSupabaseImportStore(
  db: TypedSupabaseClient
): ImportStore {
  const priv = () => db.schema('private');
  return {
    async loadBoard(boardId, wsId) {
      const { data: board, error } = await db
        .from('workspace_boards')
        .select('id, ws_id, default_done_list_id, default_closed_list_id')
        .eq('id', boardId)
        .eq('ws_id', wsId)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) fail('load board', error);
      if (!board) return null;
      const { data: lists, error: listError } = await db
        .from('task_lists')
        .select('id, name, status, position, archived, deleted')
        .eq('board_id', boardId);
      if (listError) fail('load lists', listError);
      return { board, lists: lists ?? [] };
    },

    async filterWorkspaceMembers(wsId, ids) {
      if (!ids.length) return new Set();
      const { data, error } = await db
        .from('workspace_members')
        .select('user_id')
        .eq('ws_id', wsId)
        .in('user_id', ids);
      if (error) fail('load members', error);
      return new Set((data ?? []).map((row) => row.user_id));
    },

    async filterWorkspaceLabels(wsId, ids) {
      if (!ids.length) return new Set();
      const { data, error } = await db
        .from('workspace_task_labels')
        .select('id')
        .eq('ws_id', wsId)
        .in('id', ids);
      if (error) fail('load labels', error);
      return new Set((data ?? []).map((row) => row.id));
    },

    async filterWorkspaceCycles(wsId, ids) {
      if (!ids.length) return new Set();
      const { data, error } = await db
        .from('task_cycles')
        .select('id')
        .eq('ws_id', wsId)
        .in('id', ids);
      if (error) fail('load cycles', error);
      return new Set((data ?? []).map((row) => row.id));
    },

    async ensureLabels(wsId, names, { create, actorId }) {
      const result = new Map<string, string | null>();
      if (!names.length) return result;
      const { data, error } = await db
        .from('workspace_task_labels')
        .select('id, name')
        .eq('ws_id', wsId)
        .limit(5000);
      if (error) fail('load workspace labels', error);
      const byName = new Map<string, string>(
        (data ?? []).map((row): [string, string] => [
          row.name.toLowerCase(),
          String(row.id),
        ])
      );
      for (const name of names) {
        const existing = byName.get(name.toLowerCase());
        if (existing || !create) {
          result.set(name, existing ?? null);
          continue;
        }
        const created = await db
          .from('workspace_task_labels')
          .insert({
            ws_id: wsId,
            name,
            color: LABEL_COLOR,
            creator_id: actorId,
          })
          .select('id')
          .single();
        if (created.error || !created.data) fail('create label', created.error);
        byName.set(name.toLowerCase(), created.data.id);
        result.set(name, created.data.id);
      }
      return result;
    },

    async findRefs(wsId, urls) {
      const refs = new Map<string, ExistingRef>();
      if (!urls.length) return refs;
      const { data, error } = await priv()
        .from('task_external_refs')
        .select(
          'task_id, external_url, external_state, external_state_reason, external_closed_at, external_labels, external_assignees'
        )
        .eq('ws_id', wsId)
        .eq('provider', 'github')
        .in('external_url', urls);
      if (error) fail('load external refs', error);
      for (const row of data ?? []) {
        refs.set(row.external_url, {
          task_id: row.task_id,
          external_state: row.external_state,
          external_state_reason: row.external_state_reason,
          external_closed_at: row.external_closed_at,
          external_labels: row.external_labels ?? [],
          external_assignees: row.external_assignees ?? [],
        });
      }
      return refs;
    },

    async loadTask(taskId) {
      const { data, error } = await db
        .from('tasks')
        .select('id, name, description, list_id, priority, deleted_at')
        .eq('id', taskId)
        .maybeSingle();
      if (error) fail('load task', error);
      return data;
    },

    async loadTaskLabelIds(taskId) {
      const { data, error } = await db
        .from('task_labels')
        .select('label_id')
        .eq('task_id', taskId);
      if (error) fail('load task labels', error);
      return (data ?? []).map((row) => row.label_id);
    },

    async createTask(board, actorId, task) {
      const sortKey = await resolveCreateTaskSortKey(db, {
        boardId: board.id,
        listId: task.list_id,
        userId: actorId,
      });
      if (sortKey.error || sortKey.sortKey == null) {
        fail('sort key', sortKey.error);
      }
      const { created_at, ...rest } = task;
      const { data, error } = await insertWorkspaceTask(
        db,
        {
          ...rest,
          ...(created_at ? { created_at } : {}),
          creator_id: actorId,
          sort_key: sortKey.sortKey,
        },
        false
      );
      if (error || !data) fail('create task', error);
      return data.id;
    },

    async updateTask(taskId, patch) {
      const { error } = await db.from('tasks').update(patch).eq('id', taskId);
      if (error) fail('update task', error);
    },

    async deleteTask(taskId) {
      const { error } = await db.from('tasks').delete().eq('id', taskId);
      if (error) fail('delete task', error);
    },

    async setRelations(taskId, actorId, { labelIds, assigneeIds }) {
      const { error } = await db.rpc('update_task_with_relations', {
        p_task_id: taskId,
        p_task_updates: {},
        p_actor_user_id: actorId,
        ...(labelIds ? { p_label_ids: labelIds, p_replace_labels: true } : {}),
        ...(assigneeIds
          ? { p_assignee_ids: assigneeIds, p_replace_assignees: true }
          : {}),
      });
      if (error) fail('attach relations', error);
    },

    async insertRef(wsId, taskId, actorId, url, values) {
      const { error } = await priv()
        .from('task_external_refs')
        .insert({
          ...values,
          task_id: taskId,
          ws_id: wsId,
          provider: 'github',
          external_url: url,
          imported_by: actorId,
        });
      if (!error) return 'created';
      if ((error as { code?: string }).code === '23505') return 'conflict';
      return fail('save external ref', error);
    },

    async updateRef(wsId, url, values) {
      const { error } = await priv()
        .from('task_external_refs')
        .update(values)
        .eq('ws_id', wsId)
        .eq('provider', 'github')
        .eq('external_url', url);
      if (error) fail('update external ref', error);
    },

    async commentUrls(taskId) {
      const { data, error } = await priv()
        .from('task_comments')
        .select('external_url')
        .eq('task_id', taskId)
        .not('external_url', 'is', null);
      if (error) fail('load comments', error);
      return new Set(
        (data ?? []).flatMap((row) =>
          row.external_url ? [row.external_url] : []
        )
      );
    },

    async insertComments(wsId, taskId, rows) {
      for (let index = 0; index < rows.length; index += 100) {
        const { error } = await priv()
          .from('task_comments')
          .upsert(
            rows.slice(index, index + 100).map((row) => ({
              ...row,
              task_id: taskId,
              ws_id: wsId,
            })),
            { onConflict: 'task_id,external_url', ignoreDuplicates: true }
          );
        if (error) fail('insert comments', error);
      }
    },

    async linkUrls(taskId) {
      const { data, error } = await priv()
        .from('task_links')
        .select('url')
        .eq('task_id', taskId)
        .is('removed_at', null);
      if (error) fail('load links', error);
      return new Set((data ?? []).map((row) => row.url));
    },

    async insertLinks(wsId, taskId, actorId, rows) {
      if (!rows.length) return;
      const { error } = await priv()
        .from('task_links')
        .insert(
          rows.map((row) => ({
            ...row,
            task_id: taskId,
            ws_id: wsId,
            created_by: actorId,
          }))
        );
      if (error) fail('insert links', error);
    },

    async insertHistory(rows) {
      if (!rows.length) return;
      const { error } = await db.from('task_history').insert(
        rows.map((row) => ({
          ...row,
          old_value: (row.old_value ?? null) as never,
          new_value: (row.new_value ?? null) as never,
          metadata: row.metadata as never,
        }))
      );
      if (error) fail('record history', error);
    },

    async addToCycle(taskId, cycleId) {
      const { error } = await db
        .from('task_cycle_tasks')
        .upsert(
          { task_id: taskId, cycle_id: cycleId },
          { onConflict: 'cycle_id,task_id', ignoreDuplicates: true }
        );
      if (error) fail('add to cycle', error);
    },

    async taskIdsByRefUrl(wsId, urls) {
      const found = await this.findRefs(wsId, urls);
      return new Map([...found].map(([url, ref]) => [url, ref.task_id]));
    },

    async linkParentChild(parentId, childId, actorId) {
      const { error } = await db.from('task_relationships').upsert(
        {
          source_task_id: parentId,
          target_task_id: childId,
          type: 'parent_child',
          created_by: actorId,
        },
        {
          onConflict: 'source_task_id,target_task_id,type',
          ignoreDuplicates: true,
        }
      );
      if (error) fail('link parent and child', error);
    },
  };
}
