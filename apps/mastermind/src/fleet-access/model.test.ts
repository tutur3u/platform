import { fleetIntentInputSchema } from '@tuturuuu/internal-api/fleet';
import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import {
  answerFromDigest,
  draftToInput,
  fieldErrors,
  type RequestDraft,
  requestOptions,
  visibleTabs,
} from './model';
import { fixtures } from './test-fixtures';

const draft = (patch: Partial<RequestDraft>): RequestDraft => ({
  kind: 'comment',
  projectKey: 'web',
  targetKey: 'lane-web',
  choice: '',
  commitSha: '',
  quote: '',
  ...patch,
});

describe('Fleet tabs', () => {
  it('shows an Observer status, ask, requests and linking only', () => {
    expect(visibleTabs(fixtures.observer)).toEqual([
      'status',
      'ask',
      'requests',
      'link',
    ]);
  });

  it('adds Approvals at Steerer and Access only for the Owner', () => {
    expect(visibleTabs(fixtures.steerer)).toContain('approvals');
    expect(visibleTabs(fixtures.steerer)).not.toContain('access');
    expect(visibleTabs(fixtures.owner)).toEqual([
      'status',
      'ask',
      'requests',
      'approvals',
      'link',
      'access',
    ]);
  });

  it('hides digest tabs without status.read', () => {
    expect(
      visibleTabs({ ...fixtures.observer, capabilities: ['ask'] })
    ).toEqual(['requests', 'link']);
  });
});

describe('Fleet request options', () => {
  it('files Observer steering for Owner approval and never as a question', () => {
    const options = requestOptions(fixtures.observer);
    expect(options[0]).toEqual({
      kind: 'status_question',
      ownerApproval: false,
    });
    expect(options.slice(1).every(({ ownerApproval }) => ownerApproval)).toBe(
      true
    );
    expect(
      requestOptions({ ...fixtures.observer, capabilities: ['intent.request'] })
    ).not.toContainEqual(expect.objectContaining({ kind: 'status_question' }));
  });

  it('uses held capabilities directly and omits the rest without intent.request', () => {
    const kinds = requestOptions(fixtures.steerer).map(({ kind }) => kind);
    expect(kinds).toContain('priority.set');
    expect(kinds).toContain('approve.item');
    expect(kinds).not.toContain('approve.deploy');
    expect(
      requestOptions(fixtures.steerer).every(
        ({ ownerApproval }) => !ownerApproval
      )
    ).toBe(true);
  });
});

describe('Fleet request drafts', () => {
  it('requires a note for comments and a valid target key', () => {
    expect(fieldErrors(draft({}))).toEqual({ quote: 'required' });
    expect(fieldErrors(draft({ quote: 'Ship it', targetKey: '' }))).toEqual({
      targetKey: 'required',
    });
    expect(
      fieldErrors(draft({ quote: 'Ship it', targetKey: 'Lane Web' }))
    ).toEqual({ targetKey: 'badKey' });
  });

  it('builds strict release payloads with a full commit SHA', () => {
    const release = draft({
      kind: 'approve.production_change',
      commitSha: 'abc1234',
    });
    expect(fieldErrors(release)).toEqual({ commitSha: 'badSha' });
    const input = draftToInput({ ...release, commitSha: 'a'.repeat(40) });
    expect(fleetIntentInputSchema.parse(input)).toEqual({
      kind: 'approve.production_change',
      payload: {
        projectKey: 'web',
        targetKey: 'lane-web',
        commitSha: 'a'.repeat(40),
        environment: 'production',
      },
    });
  });

  it('omits the target for status questions', () => {
    const input = draftToInput(
      draft({ kind: 'status_question', choice: 'timeline' })
    );
    expect(fleetIntentInputSchema.safeParse(input).success).toBe(true);
  });
});

describe('Digest answers', () => {
  const sections = fixtures.digest.sections;

  it('answers only from a visible project snapshot', () => {
    expect(answerFromDigest(sections, 'mobile', 'status')).toEqual({
      kind: 'no-snapshot',
    });
  });

  it('counts states, lists readiness and orders timelines by ETA', () => {
    const status = answerFromDigest(sections, 'web', 'status');
    expect(status.kind === 'status' && status.counts).toEqual([
      ['running', 1],
      ['blocked', 1],
      ['ready', 1],
    ]);
    const readiness = answerFromDigest(sections, 'web', 'readiness');
    expect(
      readiness.kind === 'readiness' && readiness.lanes.map(({ lane }) => lane)
    ).toEqual(['Checkout', 'Billing']);
    const timeline = answerFromDigest(sections, 'web', 'timeline');
    expect(
      timeline.kind === 'timeline' && timeline.lanes.map(({ lane }) => lane)
    ).toEqual(['Billing', 'Search']);
  });
});

describe('Fleet access messages', () => {
  const shape = (value: unknown): unknown =>
    value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, entry]) => [key, shape(entry)])
        )
      : typeof value;

  it('ships the same keys in English and Vietnamese', () => {
    expect(shape(vi.fleetAccess)).toEqual(shape(en.fleetAccess));
  });
});
