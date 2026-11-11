import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const policy = vi.hoisted(() => ({ read: vi.fn(), app: { value: 'meet' } }));
vi.mock('@tuturuuu/meet-core/runtime', () => ({
  get MEETING_APP() {
    return policy.app.value;
  },
}));
vi.mock('@tuturuuu/utils/meet-classroom-policy', () => ({
  getClassroomParticipantCap: policy.read,
  MeetClassroomPolicyError: class extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
}));
vi.mock('./call-access', () => ({
  MeetCallAccessError: class extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
}));
import { getClassroomParticipantCap } from './classroom-policy';
afterEach(() => {
  vi.clearAllMocks();
  policy.app.value = 'meet';
});
it('leaves Parley unchanged and performs no classroom lookup', async () => {
  policy.app.value = 'parley';
  expect(
    await getClassroomParticipantCap('meeting', 'workspace')
  ).toBeUndefined();
  expect(policy.read).not.toHaveBeenCalled();
});
it('Meet uses the shared authoritative policy', async () => {
  policy.read.mockResolvedValueOnce(50);
  expect(await getClassroomParticipantCap('meeting', 'workspace')).toBe(50);
  expect(policy.read).toHaveBeenCalledWith('meeting', 'workspace');
});
