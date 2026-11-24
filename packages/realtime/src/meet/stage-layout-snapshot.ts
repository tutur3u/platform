import { z } from 'zod';

/**
 * A leader's stage arrangement as Follow carries it: the pane tree, which
 * pane is focused and which is maximized. It is bounded like the layouts the
 * stage keeps locally (at most three panes, four levels and 24 tabs), so one
 * follow message stays a few kilobytes however it is filled.
 */
export const MEET_STAGE_LAYOUT_MAX_PANES = 3;
export const MEET_STAGE_LAYOUT_MAX_DEPTH = 4;
export const MEET_STAGE_LAYOUT_MAX_TABS = 24;
export const MEET_STAGE_LAYOUT_MAX_BYTES = 4096;

const paneId = z.string().regex(/^p\d{1,6}$/);
const splitId = z.string().regex(/^s\d{1,6}$/);
/** `programming`, `board`, `whiteboard`, `tool:<id>` and the like. */
const activityId = z.string().regex(/^[a-z0-9][a-z0-9:_-]{0,47}$/);

export interface MeetStageLayoutPane {
  kind: 'pane';
  id: string;
  tabs: string[];
  active: string;
}

export interface MeetStageLayoutSplit {
  kind: 'split';
  id: string;
  axis: 'row' | 'column';
  children: MeetStageLayoutNode[];
  sizes: number[];
}

export type MeetStageLayoutNode = MeetStageLayoutPane | MeetStageLayoutSplit;

export interface MeetStageLayoutSnapshot {
  root: MeetStageLayoutNode | null;
  focusedPaneId: string | null;
  maximizedPaneId: string | null;
}

const nodeSchema: z.ZodType<MeetStageLayoutNode> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('pane'),
      id: paneId,
      tabs: z.array(activityId).min(1).max(MEET_STAGE_LAYOUT_MAX_TABS),
      active: activityId,
    }),
    z.object({
      kind: z.literal('split'),
      id: splitId,
      axis: z.enum(['row', 'column']),
      children: z.array(nodeSchema).min(2).max(MEET_STAGE_LAYOUT_MAX_PANES),
      sizes: z.array(z.number().gt(0).max(100)).min(2),
    }),
  ])
);

function measure(node: MeetStageLayoutNode, depth: number) {
  if (node.kind === 'pane')
    return { panes: 1, tabs: node.tabs.length, depth, sized: true };
  let panes = 0;
  let tabs = 0;
  let deepest = depth;
  let sized = node.sizes.length === node.children.length;
  for (const child of node.children) {
    const inner = measure(child, depth + 1);
    panes += inner.panes;
    tabs += inner.tabs;
    deepest = Math.max(deepest, inner.depth);
    sized &&= inner.sized;
  }
  return { panes, tabs, depth: deepest, sized };
}

export const meetStageLayoutSnapshotSchema: z.ZodType<MeetStageLayoutSnapshot> =
  z
    .object({
      root: nodeSchema.nullable(),
      focusedPaneId: paneId.nullable(),
      maximizedPaneId: paneId.nullable(),
    })
    .refine(
      (layout) => {
        if (!layout.root) return true;
        const size = measure(layout.root, 1);
        return (
          size.sized &&
          size.panes <= MEET_STAGE_LAYOUT_MAX_PANES &&
          size.tabs <= MEET_STAGE_LAYOUT_MAX_TABS &&
          size.depth <= MEET_STAGE_LAYOUT_MAX_DEPTH
        );
      },
      { message: 'layout is too large' }
    )
    .refine(
      (layout) =>
        new TextEncoder().encode(JSON.stringify(layout)).byteLength <=
        MEET_STAGE_LAYOUT_MAX_BYTES,
      { message: 'layout is too large' }
    );
