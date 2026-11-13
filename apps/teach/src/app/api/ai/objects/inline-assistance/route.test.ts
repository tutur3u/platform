import { beforeEach, describe, expect, it, vi } from 'vitest';
import { inlineAssistanceRequestSchema } from './schema';

const mocks = vi.hoisted(() => ({
  course: vi.fn(),
  module: vi.fn(),
  handler: vi.fn((config) => config),
}));
vi.mock('../shared', () => ({
  createTeachObjectGenerationHandler: mocks.handler,
}));
vi.mock('@tuturuuu/education-core/teach/api', () => ({
  validateTeachCourse: mocks.course,
  validateTeachCourseModule: mocks.module,
}));
const input = {
  wsId: 'workspace',
  courseId: '11111111-1111-4111-8111-111111111111',
  moduleId: '22222222-2222-4222-8222-222222222222',
  text: 'She go home.',
  subject: 'writing' as const,
  locale: 'vi' as const,
  level: 'hints' as const,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.course.mockResolvedValue({ id: input.courseId });
  mocks.module.mockResolvedValue({ id: input.moduleId });
});
async function config() {
  await import('./route');
  return (
    mocks.handler.mock.calls[0]?.[0] ??
    ((await import('./route')).POST as unknown as ReturnType<
      typeof mocks.handler
    >)
  );
}

describe('teacher authoring assistance route', () => {
  it('rejects off, unknown subjects, whitespace, oversize and invalid module ids', () => {
    for (const patch of [
      { level: 'off' },
      { level: 'answers' },
      { subject: 'constructor' },
      { text: '  ' },
      { text: 'a'.repeat(12_001) },
      { moduleId: 'other' },
    ]) {
      expect(
        inlineAssistanceRequestSchema.safeParse({ ...input, ...patch }).success
      ).toBe(false);
    }
  });
  it('checks workspace-scoped course ownership before module lookup', async () => {
    const route = await config();
    const db = {};
    mocks.course.mockResolvedValue(null);
    const response = await route.validateInput(input, {
      db,
      wsId: 'normalized',
    });
    expect(response.status).toBe(404);
    expect(mocks.course).toHaveBeenCalledWith({
      db,
      wsId: 'normalized',
      courseId: input.courseId,
    });
    expect(mocks.module).not.toHaveBeenCalled();
  });
  it('checks the module against its course and fails closed on lookup errors', async () => {
    const route = await config();
    expect(
      await route.validateInput(input, { db: {}, wsId: 'normalized' })
    ).toBeNull();
    expect(mocks.module).toHaveBeenCalledWith({
      db: {},
      courseId: input.courseId,
      moduleId: input.moduleId,
    });
    mocks.module.mockRejectedValue(new Error('DB down'));
    expect(
      (await route.validateInput(input, { db: {}, wsId: 'normalized' })).status
    ).toBe(500);
  });
  it('uses separate Vietnamese hint instructions, no memory, and bounded results', async () => {
    const route = await config();
    const messages = route.buildMessages(input);
    expect(messages.user).toBe(input.text);
    expect(messages.system).toContain('Vietnamese');
    expect(messages.system).toContain('HINTS ONLY');
    expect(route.useMemory).toBe(false);
    expect(route.redactErrors).toBe(true);
    expect(
      route.outputSchema.safeParse({
        suggestions: new Array(21).fill({
          id: 'x',
          from: 0,
          to: 1,
          original: 'S',
          explanation: 'Hint',
        }),
      }).success
    ).toBe(false);
  });
});
