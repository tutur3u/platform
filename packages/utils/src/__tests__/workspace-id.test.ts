import * as fc from 'effect/FastCheck';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  normalizeWorkspaceContextId,
  PERSONAL_WORKSPACE_SLUG,
  ROOT_WORKSPACE_ID,
} from '../constants';
import { type WorkspaceId, workspaceIdSchema } from '../workspace-id';

const UUID = '11111111-1111-4111-8111-111111111111';

describe('workspaceIdSchema', () => {
  it.each([
    [UUID, UUID],
    [ROOT_WORKSPACE_ID, ROOT_WORKSPACE_ID],
    [
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
    ],
    ['personal', PERSONAL_WORKSPACE_SLUG],
    ['PERSONAL', PERSONAL_WORKSPACE_SLUG],
    ['internal', ROOT_WORKSPACE_ID],
    ['INTERNAL', ROOT_WORKSPACE_ID],
    [' personal ', PERSONAL_WORKSPACE_SLUG],
  ])('parses %s as %s', (input, expected) => {
    expect(workspaceIdSchema.parse(input)).toBe(expected);
  });

  it.each([
    '',
    '   ',
    'root',
    'workspace-handle',
    'not-a-uuid',
    `${UUID}/other`,
    UUID.replaceAll('-', ''),
    null,
    undefined,
    42,
    {},
  ])('rejects %j', (input) => {
    expect(workspaceIdSchema.safeParse(input).success).toBe(false);
  });

  it('keeps UUIDs unchanged and parsing idempotent', () => {
    fc.assert(
      fc.property(fc.uuid(), (uuid) => {
        const parsed = workspaceIdSchema.parse(uuid);
        expect(parsed).toBe(uuid);
        expect(workspaceIdSchema.parse(parsed)).toBe(parsed);
      }),
      { seed: 20261026, numRuns: 100 }
    );
  });

  it('reuses context normalization for mixed-case aliases', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(PERSONAL_WORKSPACE_SLUG, 'internal'),
        fc.array(fc.boolean(), { minLength: 8, maxLength: 8 }),
        (alias, upper) => {
          const input = [...alias]
            .map((letter, index) =>
              upper[index] ? letter.toUpperCase() : letter
            )
            .join('');
          expect(workspaceIdSchema.parse(input)).toBe(
            normalizeWorkspaceContextId(input)
          );
        }
      ),
      { seed: 20261026, numRuns: 100 }
    );
  });

  it('rejects arbitrary text wrapped around a valid UUID', () => {
    fc.assert(
      fc.property(fc.string(), fc.uuid(), (prefix, uuid) => {
        expect(workspaceIdSchema.safeParse(`${prefix}/${uuid}`).success).toBe(
          false
        );
      }),
      { seed: 20261026, numRuns: 100 }
    );
  });

  it('requires parsing before a string can be used as a WorkspaceId', () => {
    expectTypeOf<string>().not.toExtend<WorkspaceId>();
    expectTypeOf(workspaceIdSchema.parse(UUID)).toEqualTypeOf<WorkspaceId>();
    expectTypeOf<WorkspaceId>().toExtend<string>();
  });
});
