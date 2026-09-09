import type { MemoryCommand } from '../../src/features/live-assistant/memory-command';
import { type LiveEnvironment, liveDatabase } from './storage';

/** Commands are replayable after a Worker restart; every write is scoped to one owner. */
export async function applyMemoryCommand(
  env: LiveEnvironment,
  ownerId: string,
  command: MemoryCommand
) {
  if (command.action === 'settings') {
    await liveDatabase(env, 'meet_ai_user_preferences?on_conflict=user_id', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates',
      body: {
        user_id: ownerId,
        memory_enabled: command.enabled,
        updated_at: new Date().toISOString(),
      },
    });
    return { ok: true };
  }
  if (command.action === 'save') {
    await liveDatabase(env, 'rpc/save_meet_ai_memory', {
      method: 'POST',
      body: {
        p_user_id: ownerId,
        p_content: command.content,
        p_category: command.category,
      },
    });
    return { ok: true };
  }
  const rows = await liveDatabase<Array<{ id: string }>>(
    env,
    `meet_ai_memories?user_id=eq.${ownerId}&id=eq.${command.id}&select=id`,
    {
      method: command.action === 'edit' ? 'PATCH' : 'DELETE',
      prefer: 'return=representation',
      body:
        command.action === 'edit' ? { content: command.content } : undefined,
    }
  );
  return { ok: command.action === 'delete' || rows.length > 0 };
}
