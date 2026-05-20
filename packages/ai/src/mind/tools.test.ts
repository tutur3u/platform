import { describe, expect, it } from 'vitest';
import { coerceMindAiPatch, normalizeGeneratedPatchIds } from './tools';

describe('normalizeGeneratedPatchIds', () => {
  it('generates missing node and edge ids and resolves operation-id edge refs', () => {
    const patch = normalizeGeneratedPatchIds({
      operations: [
        {
          id: 'add_devops_node',
          kind: 'create_node',
          node: {
            horizon: 'month',
            id: 'devops_node',
            nodeType: 'idea',
            positionX: 0,
            positionY: 300,
            status: 'planned',
            title: 'DevOps & Infrastructure',
          },
        },
        {
          id: 'add_mvp_node',
          kind: 'create_node',
          node: {
            id: 'mvp_node',
            horizon: 'quarter',
            nodeType: 'milestone',
            positionX: 0,
            positionY: 0,
            status: 'planned',
            title: 'Phase 1: MVP',
          },
        },
        {
          edge: {
            edgeType: 'supports',
            id: 'devops_mvp_edge',
            label: 'supports delivery',
            sourceNodeId: 'add_devops_node',
            targetNodeId: 'mvp_node',
          },
          id: 'link_devops_to_mvp',
          kind: 'create_edge',
        },
      ],
      summary: 'Add technical foundation nodes.',
    });
    const [devopsOperation, mvpOperation, edgeOperation] = patch.operations;

    expect(devopsOperation?.kind).toBe('create_node');
    expect(mvpOperation?.kind).toBe('create_node');
    expect(edgeOperation?.kind).toBe('create_edge');
    if (
      devopsOperation?.kind !== 'create_node' ||
      mvpOperation?.kind !== 'create_node' ||
      edgeOperation?.kind !== 'create_edge'
    ) {
      throw new Error('Unexpected patch shape');
    }

    expect(devopsOperation.node.id).toMatch(UUID_PATTERN);
    expect(mvpOperation.node.id).toMatch(UUID_PATTERN);
    expect(edgeOperation.edge.id).toMatch(UUID_PATTERN);
    expect(edgeOperation.edge.sourceNodeId).toBe(devopsOperation.node.id);
    expect(edgeOperation.edge.targetNodeId).toBe(mvpOperation.node.id);
  });
});

describe('coerceMindAiPatch', () => {
  it('accepts nested update payloads and non-canonical generated enums', () => {
    const patch = coerceMindAiPatch({
      operations: [
        {
          id: 'update_baseline',
          kind: 'update_node',
          node: {
            body: 'Define privacy-by-design requirements for MVP launch.',
            id: '5279e3f1-bf4c-4e95-ac64-0d519e10db83',
            title: 'Compliance Baseline & Data Privacy',
          },
        },
        {
          id: 'add_encryption_task',
          kind: 'create_node',
          node: {
            body: 'Implement encryption for sensitive data at rest.',
            horizon: 'month',
            id: 'node_encryption_task',
            nodeType: 'action',
            parentNodeId: '5279e3f1-bf4c-4e95-ac64-0d519e10db83',
            status: 'planned',
            title: 'Encryption Strategy Implementation',
          },
        },
        {
          edge: {
            edgeType: 'validates',
            id: '9da91129-e15f-4774-9a89-ad40199e2b51',
            label: 'blocks MVP release until satisfied',
          },
          id: 'update_dependency_edge',
          kind: 'update_edge',
        },
      ],
      summary: 'Refine Compliance Baseline structure.',
    });

    expect('issues' in patch).toBe(false);
    if ('issues' in patch) throw new Error('Unexpected coercion failure');

    expect(patch.operations[0]).toMatchObject({
      kind: 'update_node',
      nodeId: '5279e3f1-bf4c-4e95-ac64-0d519e10db83',
      title: 'Compliance Baseline & Data Privacy',
    });
    expect(patch.operations[1]).toMatchObject({
      kind: 'create_node',
      node: {
        nodeType: 'idea',
        positionX: 320,
        positionY: 240,
      },
    });
    expect(patch.operations[2]).toMatchObject({
      edgeId: '9da91129-e15f-4774-9a89-ad40199e2b51',
      edgeType: 'supports',
      kind: 'update_edge',
    });
  });
});

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
