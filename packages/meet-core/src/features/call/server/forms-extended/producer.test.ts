import { beforeEach, expect, it, vi } from 'vitest';
import { getMeetCallAccess } from '../../lib/call-access';
import { uploadMeetFormAnswer } from './producer';

const ports = vi.hoisted(() => ({
  access: vi.fn(),
  readPublication: vi.fn(),
  reserve: vi.fn(),
  upload: vi.fn(),
  settle: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../lib/call-access', () => ({
  getMeetCallAccess: ports.access,
  MeetCallAccessError: class extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
}));
vi.mock('../forms/policy', () => ({}));
vi.mock('../room-service', () => ({}));
vi.mock('./store', () => ({ createExtendedFormsStore: vi.fn() }));
vi.mock('./operations', () => ({
  readExtendedFormPublication: ports.readPublication,
}));
vi.mock('./respondent-scope', () => ({
  deriveExtendedFormRespondentScope: () => '5'.repeat(64),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    schema: () => ({
      rpc: (name: string, args: unknown) => {
        if (name === 'start_meet_form_upload') return ports.reserve(args);
        if (name === 'finish_meet_form_upload') return ports.settle(args);
        throw new Error('Unexpected upload RPC');
      },
    }),
    storage: { from: () => ({ upload: ports.upload }) },
  }),
}));

const id = (n: number) =>
  `85000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const question = {
  id: id(1),
  type: 'file_upload',
  maxBytes: 1024,
  acceptedMimeTypes: ['application/pdf'],
};
const launchId = id(2);
const publication = {
  formId: id(3),
  versionId: id(4),
  form: { sections: [{ questions: [question] }] },
};
const available = { status: 'ok', publication };

async function upload() {
  const access = await getMeetCallAccess(id(5), 'Participant');
  const body = new FormData();
  body.append('questionId', question.id);
  body.append(
    'file',
    new File(['fixture'], 'fixture.pdf', { type: 'application/pdf' })
  );
  return uploadMeetFormAnswer(
    access,
    launchId,
    new Request('https://meet.test/upload', { method: 'POST', body })
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  ports.access.mockResolvedValue({
    meeting: { id: id(5), ws_id: id(6) },
    user: { id: id(7) },
  });
  ports.readPublication.mockResolvedValue(available);
  ports.reserve.mockResolvedValue({ data: { kind: 'write' }, error: null });
  ports.settle.mockResolvedValue({ data: true, error: null });
});

it('rechecks the launch after reading the file and does not reserve after closure', async () => {
  ports.readPublication
    .mockResolvedValueOnce(available)
    .mockResolvedValueOnce({ status: 'closed' });
  await expect(upload()).rejects.toMatchObject({ status: 410 });
  expect(ports.reserve).not.toHaveBeenCalled();
  expect(ports.upload).not.toHaveBeenCalled();
});

it('settles a definite Storage rejection as not stored, using the same reservation', async () => {
  ports.upload.mockResolvedValue({ error: { statusCode: '413' } });
  await expect(upload()).rejects.toMatchObject({ status: 503 });
  expect(ports.settle).toHaveBeenCalledExactlyOnceWith({
    ...ports.reserve.mock.calls[0][0],
    p_stored: false,
  });
});

it('leaves a transport timeout for the stale sweep', async () => {
  ports.upload.mockRejectedValue(new DOMException('deadline', 'TimeoutError'));
  await expect(upload()).rejects.toMatchObject({ name: 'TimeoutError' });
  expect(ports.settle).not.toHaveBeenCalled();
  expect(ports.upload).toHaveBeenCalledOnce();
});
