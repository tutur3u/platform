import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultFormStudioInput } from '../../../../../../../apps/forms/src/features/forms/schema';
import { loadLaunchResults } from './read-launch';

const { openAdmin, getScope } = vi.hoisted(() => ({
  openAdmin: vi.fn(),
  getScope: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: openAdmin,
}));
vi.mock('../forms/launches', () => ({ readMeetFormResultsScope: getScope }));
vi.mock('../../lib/call-access', () => ({
  MeetCallAccessError: class extends Error {
    constructor(
      readonly status: number,
      message: string
    ) {
      super(message);
    }
  },
}));

const meetingId = '7ee82c83-1e55-408a-8f74-f12123372c51';
const launchId = 'fd5eafc4-6ce3-48c0-9332-200ceed4176e';
const formId = '0d5c5784-753d-430f-b5be-8cca40c7761d';
const versionId = 'dad42ee5-4b00-40f6-a30f-70aa0ffc78c0';
const wsId = 'workspace';
const access = {
  isHost: true,
  canReadWorkspace: true,
  meeting: { id: meetingId, ws_id: wsId },
  user: { id: 'viewer' },
} as Parameters<typeof loadLaunchResults>[0];

const scope = {
  launchId,
  formId,
  versionId,
  form: {
    ...createDefaultFormStudioInput(),
    sections: [],
    id: formId,
    wsId,
  },
};

const page = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  lte: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  abortSignal: vi.fn().mockResolvedValue({
    data: [{ id: 'response', answers: [] }],
    error: null,
  }),
};
const form = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn().mockResolvedValue({ data: { id: formId }, error: null }),
};
const from = vi.fn((table: string) => (table === 'forms' ? form : page));
const schema = vi.fn(() => ({ from }));

beforeEach(() => {
  vi.clearAllMocks();
  getScope.mockResolvedValue(scope);
  openAdmin.mockResolvedValue({ schema });
});

describe('launch result database boundary', () => {
  it('denies a non-host before loading the scope or opening a database client', async () => {
    await expect(
      loadLaunchResults({ ...access, isHost: false }, launchId)
    ).rejects.toMatchObject({ status: 403 });
    expect(getScope).not.toHaveBeenCalled();
    expect(openAdmin).not.toHaveBeenCalled();
  });

  it('preserves a Forms permission denial without querying responses', async () => {
    getScope.mockRejectedValueOnce(Object.assign(new Error(), { status: 403 }));
    await expect(loadLaunchResults(access, launchId)).rejects.toMatchObject({
      status: 403,
    });
    expect(openAdmin).not.toHaveBeenCalled();
  });

  it('rejects a scope outside the workspace without reading Forms tables', async () => {
    getScope.mockResolvedValueOnce({
      ...scope,
      form: { ...scope.form, wsId: 'other-workspace' },
    });
    await expect(loadLaunchResults(access, launchId)).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it('joins only submitted sessions in the exact room, launch, version and form', async () => {
    await expect(loadLaunchResults(access, launchId)).resolves.toMatchObject({
      meetingId,
      launchId,
      formId,
      versionId,
      responseCount: 1,
    });
    expect(getScope).toHaveBeenCalledWith(access, launchId);
    expect(schema).toHaveBeenCalledWith('private');
    expect(form.eq.mock.calls).toEqual([
      ['id', formId],
      ['ws_id', wsId],
    ]);
    expect(page.select).toHaveBeenCalledWith(
      'id, session:form_sessions!inner(id), answers:form_response_answers(*)'
    );
    expect(page.eq.mock.calls).toEqual([
      ['form_id', formId],
      ['session.form_id', formId],
      ['session.metadata->>meetRoomId', meetingId],
      ['session.metadata->>meetLaunchId', launchId],
      ['session.metadata->>meetVersionId', versionId],
    ]);
    expect(page.lte.mock.calls).toEqual([
      ['session.submitted_at', expect.any(String)],
      ['submitted_at', expect.any(String)],
    ]);
  });
});
