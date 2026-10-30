import { expect, it } from 'vitest';
import {
  orgActivitySchema,
  orgEdgeKindSchema,
  orgStatusSchema,
} from './contract-v3';
import { ORG_CANARIES } from './org-canaries';
import { ingestSchema } from './schema';

const node = {
  key: 'a'.repeat(32),
  kind: 'agent',
  label: 'Release agent',
  role: 'Release',
  status: 'working',
  activity: 'now',
  taskTitle: 'Prepare release',
  prRefs: [123],
};
const lane = { ...node, key: 'b'.repeat(32), kind: 'lane' };
const org = {
  nodes: [node, lane],
  edges: [{ from: node.key, to: lane.key, kind: 'delegates_to' }],
};
const snapshot = {
  needsYou: [],
  environments: [],
  lanes: [],
  backlog: [],
  org,
};
const envelope = { v: 3, seq: 1, sentAt: 1793000000000, events: [], snapshot };
const withNode = (patch: Record<string, unknown>) => ({
  ...envelope,
  snapshot: {
    ...snapshot,
    org: { ...org, nodes: [{ ...node, ...patch }, lane] },
  },
});
it('accepts v3, preserves v2, rejects v1 and v2 org', () => {
  expect(ingestSchema.parse(envelope).snapshot).toEqual(snapshot);
  const { org: omitted, ...v2Snapshot } = snapshot;
  expect(omitted).toEqual(org);
  expect(
    ingestSchema.safeParse({ ...envelope, v: 2, snapshot: v2Snapshot }).success
  ).toBe(true);
  expect(ingestSchema.safeParse({ ...envelope, v: 2 }).success).toBe(false);
  expect(ingestSchema.safeParse({ ...envelope, v: 1 }).success).toBe(false);
  expect(ingestSchema.safeParse({ ...envelope, v: 4 }).success).toBe(false);
  expect(
    ingestSchema.safeParse({ ...envelope, snapshot: undefined }).success
  ).toBe(true);
});
it('closes every new object boundary and refuses humans and customer relations', () => {
  for (const invalid of [
    { ...envelope, raw: true },
    { ...envelope, snapshot: { ...snapshot, raw: true } },
    { ...envelope, snapshot: { ...snapshot, org: { ...org, raw: true } } },
    withNode({ raw: true }),
    withNode({ kind: 'human' }),
    {
      ...envelope,
      snapshot: {
        ...snapshot,
        org: { ...org, edges: [{ ...org.edges[0], raw: true }] },
      },
    },
    {
      ...envelope,
      snapshot: {
        ...snapshot,
        org: { ...org, edges: [{ ...org.edges[0], kind: 'customer_of' }] },
      },
    },
  ])
    expect(ingestSchema.safeParse(invalid).success).toBe(false);
});
it.each(ORG_CANARIES)(
  'refuses $kind labels and drops whole $kind task titles',
  ({ value }) => {
    expect(ingestSchema.safeParse(withNode({ label: value })).success).toBe(
      false
    );
    const parsed = ingestSchema.parse(withNode({ taskTitle: value }));
    if (parsed.v !== 3) throw new Error('Expected v3');
    expect(parsed.snapshot?.org?.nodes[0]?.taskTitle).toBeNull();
    expect(JSON.stringify(parsed)).not.toContain(value);
    for (const field of ['role', 'team', 'pool', 'modelFamily']) {
      expect(ingestSchema.safeParse(withNode({ [field]: value })).success).toBe(
        false
      );
    }
  }
);
it('accepts exactly the enum values', () => {
  for (const status of orgStatusSchema.options)
    expect(ingestSchema.safeParse(withNode({ status })).success).toBe(true);
  for (const activity of orgActivitySchema.options)
    expect(ingestSchema.safeParse(withNode({ activity })).success).toBe(true);
  for (const kind of orgEdgeKindSchema.options) {
    expect(
      ingestSchema.safeParse({
        ...envelope,
        snapshot: {
          ...snapshot,
          org: { ...org, edges: [{ ...org.edges[0], kind }] },
        },
      }).success
    ).toBe(true);
  }
  for (const patch of [
    { status: 'running' },
    { activity: 123 },
    { activity: 'yesterday' },
    { status: null },
  ]) {
    expect(ingestSchema.safeParse(withNode(patch)).success).toBe(false);
  }
});
it('bounds keys, strings and PR references', () => {
  for (const patch of [
    { key: 'agent-release' },
    { key: 'a'.repeat(31) },
    { key: 'a'.repeat(33) },
    { key: 'G'.repeat(32) },
    { label: 'x'.repeat(81) },
    { label: '' },
    { role: 'x'.repeat(81) },
    { team: 'x'.repeat(65) },
    { pool: 'x'.repeat(65) },
    { modelFamily: 'x'.repeat(81) },
    { taskTitle: 'x'.repeat(81) },
    { label: 'unsafe\nlabel' },
    { prRefs: Array(11).fill(1) },
    { prRefs: [1.5] },
    { prRefs: [-1] },
    { prRefs: [0] },
    { prRefs: ['123'] },
    { prRefs: [Number.MAX_SAFE_INTEGER + 1] },
  ])
    expect(ingestSchema.safeParse(withNode(patch)).success).toBe(false);
  expect(
    ingestSchema.safeParse(
      withNode({ taskTitle: null, prRefs: Array(10).fill(1) })
    ).success
  ).toBe(true);
  expect(
    ingestSchema.safeParse(
      withNode({ taskTitle: 'x'.repeat(80), label: 'x'.repeat(80) })
    ).success
  ).toBe(true);
});
it('caps graph cardinality and rejects duplicate keys, duplicate and dangling edges', () => {
  const nodes = Array.from({ length: 100 }, (_, i) => ({
    ...node,
    key: i.toString(16).padStart(32, 'a'),
  }));
  const edges = nodes
    .flatMap((from) =>
      nodes
        .filter((to) => to.key !== from.key)
        .map((to) => ({ from: from.key, to: to.key, kind: 'reviews' }))
    )
    .slice(0, 400);
  const parseOrg = (value: unknown) =>
    ingestSchema.safeParse({
      ...envelope,
      snapshot: { ...snapshot, org: value },
    }).success;
  expect(parseOrg({ nodes, edges: [] })).toBe(true);
  expect(parseOrg({ nodes: [...nodes, lane], edges: [] })).toBe(false);
  expect(parseOrg({ nodes: [node, node], edges: [] })).toBe(false);
  expect(parseOrg({ nodes: [node], edges: org.edges })).toBe(false);
  expect(parseOrg({ ...org, edges: [org.edges[0], org.edges[0]] })).toBe(false);
  expect(parseOrg({ ...org, edges: [{ ...org.edges[0], to: node.key }] })).toBe(
    false
  );
  expect(parseOrg({ nodes, edges })).toBe(true);
  expect(parseOrg({ nodes, edges: Array(401).fill(org.edges[0]) })).toBe(false);
});
it('keeps the snapshot UTF-8 byte ceiling with org included', () => {
  const backlog = Array.from({ length: 100 }, (_, i) => ({
    id: `item-${i}`,
    title: '界'.repeat(100),
    owner: '界'.repeat(80),
    state: 'queued',
  }));
  const lanes = Array.from({ length: 100 }, (_, i) => ({
    id: `lane-${i}`,
    title: '界'.repeat(100),
    eta: '界'.repeat(80),
    state: 'queued',
  }));
  const needsYou = Array.from({ length: 100 }, (_, i) => ({
    id: `ask-${i}`,
    version: 1,
    contentHash: 'a'.repeat(64),
    class: 'fyi',
    risk: 'low',
    title: '界'.repeat(100),
    body: '界'.repeat(280),
    status: 'open',
  }));
  expect(
    ingestSchema.safeParse({
      ...envelope,
      snapshot: { ...snapshot, backlog, lanes, needsYou },
    }).success
  ).toBe(false);
});

it('preserves the safeExtend 128 KiB snapshot boundary with 100 org nodes', () => {
  const byteLength = (value: unknown) =>
    new TextEncoder().encode(JSON.stringify(value)).byteLength;
  const sizedSnapshot = (bytes: number) => {
    const value = {
      ...snapshot,
      org: {
        nodes: Array.from({ length: 100 }, (_, i) => ({
          ...node,
          key: i.toString(16).padStart(32, 'a'),
          label: `界${'x'.repeat(79)}`,
          role: 'x'.repeat(80),
          team: 'x'.repeat(64),
          pool: 'x'.repeat(64),
          modelFamily: 'x'.repeat(80),
          taskTitle: 'x'.repeat(80),
          prRefs: Array.from({ length: 10 }, (_, index) => index + 1),
        })),
        edges: [],
      },
      backlog: Array.from({ length: 100 }, (_, i) => ({
        id: `item-${i}`,
        title: 'x'.repeat(100),
        owner: 'x'.repeat(80),
        state: 'queued',
      })),
      needsYou: Array.from({ length: 100 }, (_, i) => ({
        id: `ask-${i}`,
        version: 1,
        contentHash: 'a'.repeat(64),
        class: 'fyi',
        risk: 'low',
        title: 'x'.repeat(100),
        body: '',
        status: 'open',
      })),
    };
    let remaining = bytes - byteLength(value);
    expect(remaining).toBeGreaterThanOrEqual(0);
    expect(remaining).toBeLessThanOrEqual(100 * 280);
    for (const item of value.needsYou) {
      const length = Math.min(remaining, 280);
      item.body = 'x'.repeat(length);
      remaining -= length;
    }
    expect(remaining).toBe(0);
    expect(value.org.nodes).toHaveLength(100);
    expect(byteLength(value)).toBe(bytes);
    return value;
  };
  const atLimit = sizedSnapshot(128 * 1024);
  const parsed = ingestSchema.parse({ ...envelope, snapshot: atLimit });
  expect(parsed.snapshot).toEqual(atLimit);
  expect(byteLength(parsed.snapshot)).toBe(128 * 1024);
  const overLimit = sizedSnapshot(128 * 1024 + 1);
  // Without org the same snapshot fits: the inherited refine must count org bytes.
  const { org: omitted, ...withoutOrg } = overLimit;
  expect(omitted.nodes).toHaveLength(100);
  expect(
    ingestSchema.safeParse({ ...envelope, snapshot: withoutOrg }).success
  ).toBe(true);
  const result = ingestSchema.safeParse({ ...envelope, snapshot: overLimit });
  expect(result.success).toBe(false);
  if (!result.success)
    expect(result.error.issues).toEqual([
      expect.objectContaining({ code: 'custom', path: ['snapshot'] }),
    ]);
});
