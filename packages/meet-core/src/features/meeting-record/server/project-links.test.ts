import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ access: vi.fn() }));
vi.mock('./access', () => ({
  meetingRecordAccess: mocks.access,
  MeetingRecordError: class extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
}));

import {
  linkMeetingProject,
  readMeetingProjects,
  unlinkMeetingProject,
} from './project-links';

const wsId = '22222222-2222-4222-8222-222222222222';
const meetingId = '33333333-3333-4333-8333-333333333333';
const projectId = '44444444-4444-4444-8444-444444444444';
const userId = '11111111-1111-4111-8111-111111111111';
const params = { params: Promise.resolve({ wsId, meetingId }) };
const project = {
  id: projectId,
  name: 'EduFest',
  status: null,
  ticket_key: 'EDU',
};

function query(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const name of ['select', 'eq', 'not', 'order', 'limit', 'delete'])
    q[name] = vi.fn(() => q);
  q.maybeSingle = vi.fn(async () => result);
  q.insert = vi.fn(async () => ({ error: null }));
  q.then = (resolve: (value: unknown) => unknown) => resolve(result);
  return q;
}

function access(canLinkProjects: boolean, tables: Record<string, unknown>) {
  const from = vi.fn((table: string) => tables[table]);
  mocks.access.mockResolvedValue({
    db: { from },
    user: { id: userId },
    wsId,
    meeting: { id: meetingId },
    canLinkProjects,
  });
  return from;
}

const request = (body?: unknown) =>
  new Request('https://meet.tuturuuu.com/api/meet-record/x/y/projects', {
    method: body ? 'POST' : 'GET',
    headers: { origin: 'https://meet.tuturuuu.com' },
    body: body ? JSON.stringify(body) : undefined,
  });

describe('meeting project links', () => {
  beforeEach(() => mocks.access.mockReset());

  it('lists links without offering projects to members who cannot link', async () => {
    const from = access(false, {
      task_project_links: query({ data: [{ project }], error: null }),
    });
    await expect(readMeetingProjects(request(), params)).resolves.toEqual({
      linked: [
        { id: projectId, name: 'EduFest', status: null, ticketKey: 'EDU' },
      ],
      available: [],
      canLink: false,
    });
    expect(from).not.toHaveBeenCalledWith('task_projects');
  });

  it('refuses to link without both linking rights', async () => {
    const from = access(false, {});
    await expect(
      linkMeetingProject(request({ projectId }), params)
    ).rejects.toMatchObject({ status: 403 });
    expect(from).not.toHaveBeenCalled();
    expect(mocks.access).toHaveBeenCalledWith(
      expect.any(Request),
      params,
      true
    );
  });

  it('links a same-workspace project as the caller', async () => {
    const links = query({ data: [{ project }], error: null });
    access(true, {
      task_projects: query({ data: { id: projectId }, error: null }),
      task_project_links: links,
    });
    await linkMeetingProject(request({ projectId }), params);
    expect(links.insert).toHaveBeenCalledWith({
      project_id: projectId,
      ws_id: wsId,
      entity_kind: 'meeting',
      entity_id: meetingId,
      created_by: userId,
    });
  });

  it('does not link a project from another workspace', async () => {
    const links = query({ data: [], error: null });
    access(true, {
      task_projects: query({ data: null, error: null }),
      task_project_links: links,
    });
    await expect(
      linkMeetingProject(request({ projectId }), params)
    ).rejects.toMatchObject({ status: 404 });
    expect(links.insert).not.toHaveBeenCalled();
  });

  it('rejects a malformed project id before writing', async () => {
    access(true, {});
    await expect(
      unlinkMeetingProject(request({ projectId: 'nope' }), params)
    ).rejects.toMatchObject({ status: 400 });
  });
});
