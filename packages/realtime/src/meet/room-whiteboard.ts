import type { BoardItem, ClassroomMutation } from './classroom-tools-schema';

const MAX_BOARD_BYTES = 256 * 1024;
const MAX_AUTHOR_BYTES = 32 * 1024;
const MAX_BOARD_ITEMS = 200;
const MAX_AUTHOR_ITEMS = 32;
const EMPTY_REVISION = '00000000-0000-0000-0000-000000000000';

type AuthoredItem = { authorId: string; item: BoardItem };
export type RoomWhiteboard = { revision: string; items: AuthoredItem[] };

export type WhiteboardView = {
  revision: string;
  items?: BoardItem[];
  canClear: boolean;
  canUndo: boolean;
};

export const emptyWhiteboard: RoomWhiteboard = {
  revision: EMPTY_REVISION,
  items: [],
};

export function projectWhiteboard(
  board: RoomWhiteboard,
  actorId: string,
  host: boolean,
  since?: string
): WhiteboardView {
  return {
    revision: board.revision,
    ...(since === board.revision
      ? {}
      : { items: board.items.map(({ item }) => item) }),
    canClear: host && board.items.length > 0,
    canUndo: board.items.some(({ authorId }) => host || authorId === actorId),
  };
}

type BoardAction = Extract<
  ClassroomMutation,
  { action: `whiteboard.${string}` }
>;

export function editWhiteboard(
  board: RoomWhiteboard,
  command: BoardAction,
  actorId: string,
  host: boolean
): RoomWhiteboard | 403 | 409 {
  let items: AuthoredItem[];
  switch (command.action) {
    case 'whiteboard.clear':
      if (!host) return 403;
      if (!board.items.length) return board;
      items = [];
      break;
    case 'whiteboard.undo': {
      let index = board.items.length - 1;
      while (index >= 0 && !host && board.items[index]?.authorId !== actorId) {
        index -= 1;
      }
      if (index < 0) return board;
      items = board.items.filter((_, i) => i !== index);
      break;
    }
    case 'whiteboard.draw': {
      const existing = board.items.find(
        ({ item }) => item.id === command.item.id
      );
      if (existing) return existing.authorId === actorId ? board : 409;
      items = [...board.items, { authorId: actorId, item: command.item }];
      const authored = items.filter(({ authorId }) => authorId === actorId);
      if (
        items.length > MAX_BOARD_ITEMS ||
        authored.length > MAX_AUTHOR_ITEMS ||
        jsonBytes(authored) > MAX_AUTHOR_BYTES ||
        jsonBytes(items) > MAX_BOARD_BYTES
      )
        return 409;
    }
  }
  return { revision: crypto.randomUUID(), items };
}

function jsonBytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
