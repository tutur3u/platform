import { z } from 'zod';
import type { MeetRoomSnapshot } from './room';

export const roomAttachmentSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(255),
  size: z.number().int().positive().max(100_000_000),
  contentType: z.string().max(255),
  path: z.string().trim().min(1).max(1024),
  storageWsId: z.uuid(),
});
export type RoomAttachment = z.infer<typeof roomAttachmentSchema> & {
  ownerAccountId?: string;
  discarded?: boolean;
  published?: boolean;
  /** On a hidden Q&A question: only hosts may read it. */
  withheld?: boolean;
  /**
   * Taken back from a deleted Q&A answer. Its uploader or a host may then
   * remove the stored bytes, although someone else's answer carried it.
   */
  released?: boolean;
};

export const roomAttachmentCommands = [
  z.object({ action: z.literal('attach'), attachment: roomAttachmentSchema }),
  z.object({ action: z.literal('attachment'), id: z.uuid() }),
  z.object({ action: z.literal('attachment.discard'), id: z.uuid() }),
  z.object({ action: z.literal('attachment.deleted'), id: z.uuid() }),
] as const;
export type RoomAttachmentCommand = z.infer<
  (typeof roomAttachmentCommands)[number]
>;
const ACTIONS = new Set<string>(
  roomAttachmentCommands.map((command) => command.shape.action.value)
);

export function isRoomAttachmentCommand(message: {
  action: string;
}): message is RoomAttachmentCommand {
  return ACTIONS.has(message.action);
}

/**
 * What a signed read needs and nothing more. The uploader and the sharing
 * flags stay in the room, so a file cannot name who uploaded it.
 */
export function roomAttachmentRead(file: RoomAttachment) {
  const { id, name, size, contentType, path, storageWsId } = file;
  return { id, name, size, contentType, path, storageWsId };
}

type Result<State> = { state: State; body: unknown; status?: number };

export function applyRoomAttachment<State extends MeetRoomSnapshot>(
  snapshot: State,
  command: RoomAttachmentCommand,
  {
    accountId,
    admin,
    admitted,
  }: { accountId: string; admin: boolean; admitted: boolean }
): Result<State> {
  const fail = (error: string, status = 403): Result<State> => ({
    state: snapshot,
    body: { error },
    status,
  });
  const mayRemove = (file: RoomAttachment) =>
    file.ownerAccountId === accountId || (!!file.released && admin);
  if (command.action === 'attachment.deleted') {
    const file = snapshot.attachments?.[command.id];
    if (!file) return { state: snapshot, body: { ok: true } };
    if (!mayRemove(file) || !file.discarded || file.published)
      return fail('Attachment cannot be removed');
    const attachments = { ...snapshot.attachments };
    delete attachments[command.id];
    return { state: { ...snapshot, attachments }, body: { ok: true } };
  }
  if (command.action === 'attachment.discard') {
    const file = snapshot.attachments?.[command.id];
    if (!file || !mayRemove(file)) return fail('Attachment unavailable', 404);
    if (file.published) return fail('Attachment is already shared', 409);
    return {
      state: {
        ...snapshot,
        attachments: {
          ...snapshot.attachments,
          [command.id]: { ...file, discarded: true },
        },
      },
      body: { path: file.path, storageWsId: file.storageWsId },
    };
  }
  if (!admitted || snapshot.ended) return fail('Join the active meeting first');
  if (command.action === 'attach') {
    if (Object.keys(snapshot.attachments ?? {}).length >= 1000)
      return fail('Room attachment limit reached', 409);
    return {
      state: {
        ...snapshot,
        attachments: {
          ...snapshot.attachments,
          [command.attachment.id]: {
            ...command.attachment,
            ownerAccountId: accountId,
          },
        },
      },
      body: { ok: true },
    };
  }
  const file = snapshot.attachments?.[command.id];
  return file && !file.discarded && (!file.withheld || admin)
    ? { state: snapshot, body: roomAttachmentRead(file) }
    : fail('Attachment unavailable', 404);
}
