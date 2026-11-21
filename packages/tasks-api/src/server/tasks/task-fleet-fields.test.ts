import { describe, expect, it } from 'vitest';
import { CreateTaskSchema } from './create-task-schema';
import {
  jsonbTextByteLength,
  TASK_FLEET_LIMITS,
  taskFleetUpdateSchema,
} from './task-fleet-fields';
import { updateTaskSchema } from './taskId/schema';

const listId = '00000000-0000-4000-8000-000000000001';

const agents = (count: number, keyLength: number) =>
  Array.from({ length: count }, (_, position) => ({
    key: `${position}`.padEnd(keyLength, 'k'),
    kind: 'agent' as const,
    position,
  }));

const links = (count: number, urlLength: number) =>
  Array.from({ length: count }, (_, index) => ({
    kind: 'link' as const,
    url: `https://example.test/${index}/`.padEnd(urlLength, 'p'),
  }));

const issueMessages = (result: { error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map(({ message }) => message) ?? [];

describe('jsonbTextByteLength', () => {
  it('matches the Postgres jsonb text rendering', () => {
    // select '[{"key":"iris","kind":"agent","position":0}]'::jsonb::text
    expect(
      jsonbTextByteLength([{ key: 'iris', kind: 'agent', position: 0 }])
    ).toBe('[{"key": "iris", "kind": "agent", "position": 0}]'.length);
    expect(jsonbTextByteLength([])).toBe(2);
    expect(jsonbTextByteLength({})).toBe(2);
    expect(jsonbTextByteLength([1, 2])).toBe('[1, 2]'.length);
  });

  it('counts escapes and multibyte characters as UTF-8 bytes', () => {
    // "é" is 2 bytes and a newline renders as the two characters \n.
    expect(jsonbTextByteLength({ title: 'é\n"' })).toBe(
      '{"title": "'.length + 2 + 2 + 2 + '"}'.length
    );
  });

  it('omits undefined object members', () => {
    expect(jsonbTextByteLength({ kind: 'link', title: undefined })).toBe(
      '{"kind": "link"}'.length
    );
  });
});

describe('task fleet field limits', () => {
  it('accepts a reason at the character and byte limits', () => {
    const reason = '\u{1F600}'.repeat(TASK_FLEET_LIMITS.needsUserReasonChars);
    expect(new TextEncoder().encode(reason).length).toBe(
      TASK_FLEET_LIMITS.needsUserReasonBytes
    );
    expect(
      taskFleetUpdateSchema.safeParse({ needs_user_reason: reason }).success
    ).toBe(true);
  });

  it('rejects a reason over the character limit with a clear message', () => {
    const result = taskFleetUpdateSchema.safeParse({
      needs_user_reason: 'a'.repeat(TASK_FLEET_LIMITS.needsUserReasonChars + 1),
    });
    expect(issueMessages(result)).toEqual([
      'needs_user_reason must be at most 512 characters',
    ]);
  });

  it('measures the reason after trimming', () => {
    const reason = ` ${'a'.repeat(TASK_FLEET_LIMITS.needsUserReasonChars)} `;
    expect(
      taskFleetUpdateSchema.safeParse({ needs_user_reason: reason }).success
    ).toBe(true);
  });

  it('accepts agent owners within the payload limit', () => {
    expect(
      taskFleetUpdateSchema.safeParse({ virtual_assignees: agents(50, 100) })
        .success
    ).toBe(true);
  });

  it('accepts exactly the payload limit and rejects one byte more', () => {
    const agentsWithBytes = (bytes: number) => {
      const value = agents(50, 1);
      for (const entry of value) {
        entry.key = entry.key.padEnd(128, 'k');
        const over = jsonbTextByteLength(value) - bytes;
        if (over >= 0) {
          entry.key = entry.key.slice(0, 128 - over);
          return value;
        }
      }
      throw new Error(`No agent list renders as ${bytes} bytes`);
    };
    const limit = agentsWithBytes(TASK_FLEET_LIMITS.payloadBytes);
    const overLimit = agentsWithBytes(TASK_FLEET_LIMITS.payloadBytes + 1);
    expect(jsonbTextByteLength(limit)).toBe(TASK_FLEET_LIMITS.payloadBytes);
    expect(jsonbTextByteLength(overLimit)).toBe(
      TASK_FLEET_LIMITS.payloadBytes + 1
    );
    expect(
      taskFleetUpdateSchema.safeParse({ virtual_assignees: limit }).success
    ).toBe(true);
    expect(
      taskFleetUpdateSchema.safeParse({ virtual_assignees: overLimit }).success
    ).toBe(false);
  });

  it('rejects agent owners over the payload limit', () => {
    const value = agents(50, 128);
    expect(jsonbTextByteLength(value)).toBeGreaterThan(
      TASK_FLEET_LIMITS.payloadBytes
    );
    expect(
      issueMessages(
        taskFleetUpdateSchema.safeParse({ virtual_assignees: value })
      )
    ).toEqual(['virtual_assignees must be at most 8192 bytes']);
  });

  it('rejects task resources over the payload limit', () => {
    expect(
      issueMessages(
        taskFleetUpdateSchema.safeParse({ task_resources: links(50, 200) })
      )
    ).toEqual(['task_resources must be at most 8192 bytes']);
    expect(
      taskFleetUpdateSchema.safeParse({ task_resources: links(20, 200) })
        .success
    ).toBe(true);
  });

  it('applies the limits to task creation and task updates', () => {
    const oversized = {
      needs_user_reason: 'a'.repeat(TASK_FLEET_LIMITS.needsUserReasonChars + 1),
      task_resources: links(50, 200),
    };
    expect(
      issueMessages(
        CreateTaskSchema.safeParse({ name: 'Task', listId, ...oversized })
      )
    ).toEqual([
      'needs_user_reason must be at most 512 characters',
      'task_resources must be at most 8192 bytes',
    ]);
    expect(issueMessages(updateTaskSchema.safeParse(oversized))).toEqual([
      'needs_user_reason must be at most 512 characters',
      'task_resources must be at most 8192 bytes',
    ]);
  });
});
