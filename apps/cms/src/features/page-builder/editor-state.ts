import {
  type CmsBlock,
  type CmsBlockType,
  type CmsPage,
  cmsPageSchema,
  createCmsBlock,
} from '@tuturuuu/cms-blocks/schema';

/** `root`, or `<layoutBlockId>:<zoneField>` for a nested drop zone such as a column. */
export type ZoneId = 'root' | `${string}:${string}`;

export interface EditorState {
  future: CmsPage[];
  /** Consecutive edits of the same block fields share one undo step (typing). */
  lastUpdateKey?: string;
  page: CmsPage;
  past: CmsPage[];
  selectedId: string | null;
}

export type EditorAction =
  | {
      type: 'insert';
      blockType: CmsBlockType;
      id: string;
      index: number;
      zone: ZoneId;
    }
  | { type: 'move'; id: string; index: number; zone: ZoneId }
  | { type: 'update'; id: string; props: Record<string, unknown> }
  | { type: 'duplicate'; id: string; newId: string }
  | { type: 'remove'; id: string }
  | { type: 'select'; id: string | null }
  | { type: 'undo' }
  | { type: 'redo' };

const HISTORY_LIMIT = 100;

export function createEditorState(page: CmsPage): EditorState {
  return { future: [], page, past: [], selectedId: null };
}

type Zones = { blocks: CmsBlock[]; zone: ZoneId }[];

/** Lists every zone with its blocks, so callers can locate a block by id. */
export function listZones(page: CmsPage): Zones {
  const zones: Zones = [{ blocks: page.content, zone: 'root' }];
  for (const block of page.content) {
    if (block.type === 'TwoColumn') {
      zones.push({ blocks: block.props.left, zone: `${block.props.id}:left` });
      zones.push({
        blocks: block.props.right,
        zone: `${block.props.id}:right`,
      });
    }
  }
  return zones;
}

export function findBlock(page: CmsPage, id: string) {
  for (const { blocks, zone } of listZones(page)) {
    const index = blocks.findIndex((block) => block.props.id === id);
    if (index >= 0) return { block: blocks[index] as CmsBlock, index, zone };
  }
  return null;
}

/** Returns a copy of the page whose `zone` content is replaced by `edit(blocks)`. */
function editZone(
  page: CmsPage,
  zone: ZoneId,
  edit: (blocks: CmsBlock[]) => CmsBlock[]
): CmsPage {
  if (zone === 'root') return { ...page, content: edit([...page.content]) };
  const [parentId, field] = zone.split(':') as [string, string];
  return {
    ...page,
    content: page.content.map((block) =>
      block.props.id === parentId &&
      block.type === 'TwoColumn' &&
      (field === 'left' || field === 'right')
        ? {
            ...block,
            props: { ...block.props, [field]: edit([...block.props[field]]) },
          }
        : block
    ),
  };
}

function insertAt(page: CmsPage, zone: ZoneId, index: number, block: CmsBlock) {
  return editZone(page, zone, (blocks) => {
    blocks.splice(Math.max(0, Math.min(index, blocks.length)), 0, block);
    return blocks;
  });
}

function removeById(page: CmsPage, id: string) {
  const found = findBlock(page, id);
  if (!found) return page;
  return editZone(page, found.zone, (blocks) =>
    blocks.filter((block) => block.props.id !== id)
  );
}

function cloneWithId(block: CmsBlock, id: string): CmsBlock {
  const copy = structuredClone(block);
  copy.props.id = id;
  if (copy.type === 'TwoColumn') {
    for (const child of [...copy.props.left, ...copy.props.right])
      child.props.id = `${id}-${child.props.id}`;
  }
  return copy;
}

function applyEdit(state: EditorState, action: EditorAction): CmsPage | null {
  const { page } = state;
  switch (action.type) {
    case 'insert':
      return insertAt(
        page,
        action.zone,
        action.index,
        createCmsBlock(action.blockType, action.id)
      );
    case 'move': {
      const found = findBlock(page, action.id);
      // A layout block cannot be dropped into one of its own zones.
      if (!found || action.zone.startsWith(`${action.id}:`)) return null;
      const sameZone = found.zone === action.zone;
      const index =
        sameZone && found.index < action.index
          ? action.index - 1
          : action.index;
      return insertAt(
        removeById(page, action.id),
        action.zone,
        index,
        found.block
      );
    }
    case 'update': {
      const found = findBlock(page, action.id);
      if (!found) return null;
      const block = {
        ...found.block,
        props: { ...found.block.props, ...action.props, id: action.id },
      };
      return editZone(page, found.zone, (blocks) =>
        blocks.map((item, index) =>
          index === found.index ? (block as CmsBlock) : item
        )
      );
    }
    case 'duplicate': {
      const found = findBlock(page, action.id);
      if (!found) return null;
      return insertAt(
        page,
        found.zone,
        found.index + 1,
        cloneWithId(found.block, action.newId)
      );
    }
    case 'remove':
      return removeById(page, action.id);
    default:
      return null;
  }
}

export function editorReducer(
  state: EditorState,
  action: EditorAction
): EditorState {
  if (action.type === 'select')
    return { ...state, lastUpdateKey: undefined, selectedId: action.id };
  if (action.type === 'undo' || action.type === 'redo') {
    const [from, to] =
      action.type === 'undo'
        ? (['past', 'future'] as const)
        : (['future', 'past'] as const);
    const page = state[from].at(-1);
    if (!page) return state;
    return {
      ...state,
      [from]: state[from].slice(0, -1),
      lastUpdateKey: undefined,
      page,
      [to]: [...state[to], state.page],
    };
  }
  const next = applyEdit(state, action);
  // Every committed page must stay schema-valid (e.g. no layout block inside a column).
  if (!next || next === state.page || !cmsPageSchema.safeParse(next).success)
    return state;
  const selectedId =
    action.type === 'remove' && state.selectedId === action.id
      ? null
      : action.type === 'insert' || action.type === 'duplicate'
        ? action.type === 'insert'
          ? action.id
          : action.newId
        : state.selectedId;
  const updateKey =
    action.type === 'update'
      ? `${action.id}:${Object.keys(action.props).sort().join(',')}`
      : undefined;
  const coalesce = updateKey !== undefined && updateKey === state.lastUpdateKey;
  return {
    future: [],
    lastUpdateKey: updateKey,
    page: next,
    past: coalesce
      ? state.past
      : [...state.past, state.page].slice(-HISTORY_LIMIT),
    selectedId,
  };
}
