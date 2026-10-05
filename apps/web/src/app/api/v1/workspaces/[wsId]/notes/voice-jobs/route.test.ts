import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  access: vi.fn(),
  reserve: vi.fn(),
  get: vi.fn(),
  remove: vi.fn(),
  after: vi.fn(),
  form: vi.fn(),
}));
vi.mock('next/server', () => ({
  connection: async () => {},
  after: mock.after,
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => Response.json(data, init),
  },
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (handler: unknown) => handler,
}));
vi.mock('@/lib/notes-voice/access', () => ({
  notesVoiceWorkspace: mock.access,
}));
vi.mock('@/lib/notes-voice/jobs', () => ({
  reserveVoiceJob: mock.reserve,
  getVoiceJob: mock.get,
  deleteVoiceJob: mock.remove,
  publicVoiceJob: (job: unknown) => job,
  runVoiceJob: vi.fn(),
}));
vi.mock('@/lib/notes-voice/request', async () => ({
  ...(await vi.importActual<object>('@/lib/notes-voice/request')),
  readVoiceForm: mock.form,
}));

import { NotesVoiceError } from '@/lib/notes-voice/schema';
import { DELETE, GET } from './[jobId]/route';
import { POST } from './route';

const auth = { user: { id: 'actor' }, supabase: {} };
const params = {
  wsId: 'personal',
  jobId: 'd6fb2145-ae9f-4f43-a209-6bb4c24c7a87',
};
// The wrapper is mocked only to invoke the real handler with a verified actor.
const invoke = (handler: unknown) =>
  (
    handler as (
      request: Request,
      auth: unknown,
      params: typeof params
    ) => Promise<Response>
  )(new Request('https://api.example'), auth, params);
beforeEach(() => {
  vi.resetAllMocks();
  mock.access.mockResolvedValue('resolved-workspace');
});
describe('Notes voice route ownership', () => {
  it('rejects lost membership before reading audio, reserving or scheduling paid work', async () => {
    mock.access.mockRejectedValue(new NotesVoiceError(403, 'workspace_denied'));
    expect((await invoke(POST)).status).toBe(403);
    expect(mock.form).not.toHaveBeenCalled();
    expect(mock.reserve).not.toHaveBeenCalled();
    expect(mock.after).not.toHaveBeenCalled();
  });
  it('reads only the authenticated actor and resolved workspace with private no-store cache policy', async () => {
    mock.get.mockResolvedValue({ status: 'completed' });
    const response = await invoke(GET);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mock.get).toHaveBeenCalledWith(
      { userId: 'actor', wsId: 'resolved-workspace' },
      params.jobId
    );
  });
  it('does not read or delete retained artifacts after denied access', async () => {
    mock.access.mockRejectedValue(new NotesVoiceError(403, 'workspace_denied'));
    expect((await invoke(GET)).status).toBe(403);
    expect((await invoke(DELETE)).status).toBe(403);
    expect(mock.get).not.toHaveBeenCalled();
    expect(mock.remove).not.toHaveBeenCalled();
  });
  it('deletes only the actor-owned resolved workspace job', async () => {
    expect((await invoke(DELETE)).status).toBe(200);
    expect(mock.remove).toHaveBeenCalledWith(
      { userId: 'actor', wsId: 'resolved-workspace' },
      params.jobId
    );
  });
});
