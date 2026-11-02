// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sessionId = 'f0747f37-bf6d-4263-a5df-a11c57bdc762';
const wsId = '5d23287f-9094-4714-b8e0-dcce877464a0';
const groupId = 'b1c6f0a2-6f0e-4c3c-9d5f-0c1f2f7d9a11';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  render: vi.fn(),
  resolveAccess: vi.fn(),
}));

vi.mock('next/server', () => ({
  NextResponse: { json: Response.json },
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/lib/tutoring/route-access', () => ({
  resolveTutoringRouteAccess: mocks.resolveAccess,
}));
vi.mock('@tuturuuu/internal-api/tutoring-policy', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@tuturuuu/internal-api/tutoring-policy')
  >()),
  TUTORING_POLICY_CONFIG_ID: 'tutoring_policy',
  getTutoringCampus: () => 'Cơ sở 1',
  readTutoringPolicyConfigRows: () => ({
    parentMessageTemplate: template,
  }),
  renderTutoringParentMessage: mocks.render,
}));

let flagError = false;
let nameError = false;
let flagValue: string | null = null;
let centreName: string | null = 'Trung tâm Fixture';
let teacherId = 'teacher';
let reassignOnUpdate = false;
let template = 'Lịch học chính thức: {{class_time}}';
let classSessions: {
  data: Record<string, string>[] | null;
  error: unknown;
};
let calls: { args: unknown[]; method: string; table: string }[] = [];

/** A chainable query that records every call and resolves to `result`. */
function query(table: string, result: () => unknown) {
  const teacherFilters: unknown[] = [];
  const methods: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of [
    'eq',
    'gte',
    'like',
    'limit',
    'order',
    'select',
    'update',
  ]) {
    methods[method] = (...args: unknown[]) => {
      calls.push({ args, method, table });
      if (method === 'update' && reassignOnUpdate) teacherId = 'other-teacher';
      if (method === 'eq' && args[0] === 'teacher_user_id')
        teacherFilters.push(args[1]);
      return chain;
    };
  }
  const chain = Object.assign(Promise.resolve(result()), methods, {
    maybeSingle: async () =>
      table === 'workspace_configs'
        ? {
            data: { value: flagValue },
            error: flagError ? { message: 'fixture error' } : null,
          }
        : table === 'workspace_tutoring_sessions' &&
            teacherFilters.some((value) => value !== teacherId)
          ? { data: null, error: null }
          : result(),
  });
  return chain;
}

const session = {
  attendance_status: 'DONE',
  duration_minutes: 45,
  group_id: groupId,
  id: sessionId,
  reason_type: 'ABSENT_RECOVERY',
  session_date: '2026-10-31',
  start_time: '15:15:00',
  student_user_id: 'student',
  teacher_user_id: 'teacher',
};
const person = (full_name: string) => ({
  display_name: null,
  email: null,
  full_name,
});

async function preview() {
  const { POST } = await import('./route');
  return POST(
    new Request(
      `http://localhost/api/v1/workspaces/${wsId}/tutoring/sessions/${sessionId}/message-preview`,
      { method: 'POST' }
    ),
    { params: Promise.resolve({ id: sessionId, wsId }) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  calls = [];
  flagValue = null;
  flagError = false;
  nameError = false;
  centreName = 'Trung tâm Fixture';
  teacherId = 'teacher';
  reassignOnUpdate = false;
  template = 'Lịch học chính thức: {{class_time}}';
  classSessions = {
    data: [
      {
        end_timezone: 'Asia/Ho_Chi_Minh',
        ends_at: '2026-10-31T10:30:00Z',
        start_timezone: 'Asia/Ho_Chi_Minh',
        starts_at: '2026-10-31T09:00:00Z',
        status: 'scheduled',
      },
    ],
    error: null,
  };
  mocks.render.mockReturnValue('rendered');
  mocks.resolveAccess.mockResolvedValue({
    normalizedWsId: wsId,
    permissions: { withoutPermission: () => false },
  });
  const tables: Record<string, () => unknown> = {
    workspaces: () => ({
      data: { name: centreName },
      error: nameError ? { message: 'fixture error' } : null,
    }),
    workspace_configs: () => ({ data: [], error: null }),
    workspace_tutoring_sessions: () => ({
      data: { ...session, teacher_user_id: teacherId },
      error: null,
    }),
    workspace_user_linked_users: () => ({
      data: { virtual_user_id: 'teacher' },
      error: null,
    }),
    workspace_user_group_sessions: () => classSessions,
    workspace_user_groups: () => ({ data: { name: 'Lớp 6A' }, error: null }),
    workspace_users: () => ({ data: person('Học sinh'), error: null }),
  };
  const from = (table: string) => query(table, () => tables[table]?.());
  mocks.createAdminClient.mockResolvedValue({
    from,
    schema: () => ({ from }),
  });
});

describe('POST tutoring message preview', () => {
  it('reads only the scheduled class sessions of the session group and workspace', async () => {
    const response = await preview();

    expect(response.status).toBe(200);
    const classQuery = calls.filter(
      (call) => call.table === 'workspace_user_group_sessions'
    );
    expect(classQuery.map((call) => [call.method, ...call.args])).toEqual([
      ['select', 'status,starts_at,start_timezone,ends_at,end_timezone'],
      ['eq', 'ws_id', wsId],
      ['eq', 'group_id', groupId],
      ['eq', 'status', 'scheduled'],
      ['gte', 'starts_at', '2026-10-30'],
      ['order', 'starts_at', { ascending: true }],
      ['limit', 60],
    ]);
  });

  it('passes the derived values to the template', async () => {
    const response = await preview();

    expect(await response.json()).toEqual({ preview: 'rendered' });
    expect(mocks.render).toHaveBeenCalledWith(template, {
      campus: 'Cơ sở 1',
      class_time: '16:00-17:30',
      date: '31/10/2026',
      duration: '45',
      group: 'Lớp 6A',
      reason: 'bù buổi vắng',
      student: 'Học sinh',
      teacher: 'Học sinh',
      time: '15:15',
      time_range: '15:15-16:00',
      weekday: 'thứ 7',
    });
    expect(
      calls.filter(
        (call) =>
          call.table === 'workspace_tutoring_sessions' &&
          call.method === 'update'
      )[0]?.args
    ).toEqual([{ parent_message_preview: 'rendered' }]);
  });

  it('falls back to the unknown value when the class sessions cannot be read', async () => {
    classSessions = { data: null, error: { message: 'boom' } };

    const response = await preview();

    expect(response.status).toBe(200);
    expect(mocks.render.mock.calls[0]?.[1]).toMatchObject({
      class_time: 'Chưa xác định',
      student: 'Học sinh',
    });
    expect(console.error).toHaveBeenCalledWith(
      'Failed to load class sessions for tutoring preview',
      expect.objectContaining({ sessionId })
    );
  });

  it('skips the class session query when the template has no class time', async () => {
    template = 'Giờ kèm: {{time_range}}';

    const response = await preview();

    expect(response.status).toBe(200);
    expect(
      calls.some((call) => call.table === 'workspace_user_group_sessions')
    ).toBe(false);
  });
});

describe('preview teacher read scope', () => {
  function editor() {
    mocks.resolveAccess.mockResolvedValue({
      normalizedWsId: wsId,
      user: { id: 'actor' },
      permissions: {
        withoutPermission: (permission: string) =>
          permission === 'view_payroll',
      },
    });
  }
  it('denies an editor another teacher completed session without rendering or writing', async () => {
    editor();
    teacherId = 'other-teacher';
    const response = await preview();
    expect(response.status).toBe(404);
    expect(mocks.render).not.toHaveBeenCalled();
    expect(calls.some((call) => call.method === 'update')).toBe(false);
  });
  it('allows an editor their own session and scopes both read and write', async () => {
    editor();
    expect((await preview()).status).toBe(200);
    expect(
      calls
        .filter(
          (call) =>
            call.table === 'workspace_tutoring_sessions' &&
            call.method === 'eq' &&
            call.args[0] === 'teacher_user_id'
        )
        .map((call) => call.args[1])
    ).toEqual(['teacher', 'teacher']);
  });
  it('allows an editor with view_payroll another teacher session', async () => {
    teacherId = 'other-teacher';
    expect((await preview()).status).toBe(200);
    expect(mocks.render).toHaveBeenCalled();
    expect(
      calls.some(
        (call) => call.method === 'eq' && call.args[0] === 'teacher_user_id'
      )
    ).toBe(false);
  });
});

it('returns no preview if reassignment makes the self-scoped save miss', async () => {
  mocks.resolveAccess.mockResolvedValue({
    normalizedWsId: wsId,
    user: { id: 'actor' },
    permissions: {
      withoutPermission: (permission: string) => permission === 'view_payroll',
    },
  });
  reassignOnUpdate = true;
  const response = await preview();
  expect(response.status).toBe(404);
  expect(await response.json()).not.toHaveProperty('preview');
  expect(mocks.render).toHaveBeenCalled();
});

describe('workspace parent message v2', () => {
  async function useRealRenderer() {
    const actual = await vi.importActual<
      typeof import('@tuturuuu/internal-api/tutoring-policy')
    >('@tuturuuu/internal-api/tutoring-policy');
    template = actual.EASY_CENTER_PARENT_MESSAGE_TEMPLATE;
    mocks.render.mockImplementation(actual.renderTutoringParentMessage);
  }
  const legacy =
    'Trung tâm EASY xin được xếp lịch kèm cho bạn Học sinh như sau:\n• Giờ kèm: 15:15-16:00\n• Ngày: 31/10/2026 thứ 7\n• Cơ sở: Cơ sở 1\nLịch học chính thức: 16:00-17:30\nMong phụ huynh thu xếp cho con tham gia đúng giờ. Trân trọng.';
  const v2 =
    'Trung tâm Fixture xin được xếp lịch kèm cho bạn Học sinh như sau:\n• Giờ kèm: 15:15-16:00\n• Ngày: 31/10/2026 thứ 7\n• Cơ sở: Cơ sở 1\nLịch học chính thức: 16:00-17:30\nMong phụ huynh thu xếp cho con tham gia đúng giờ.\nTrân trọng';
  it.each([null, 'false', 'TRUE'])(
    'keeps legacy bytes with flag %s',
    async (value) => {
      await useRealRenderer();
      flagValue = value;
      expect(await (await preview()).json()).toEqual({ preview: legacy });
      expect(calls.some((call) => call.table === 'workspaces')).toBe(false);
    }
  );
  it('uses the workspace name and exact Vietnamese closing', async () => {
    await useRealRenderer();
    flagValue = 'true';
    expect(await (await preview()).json()).toEqual({ preview: v2 });
    expect(calls).toContainEqual({
      table: 'workspaces',
      method: 'eq',
      args: ['id', wsId],
    });
    expect(calls).toContainEqual({
      table: 'workspace_configs',
      method: 'eq',
      args: ['id', 'tutoring_parent_message_v2'],
    });
    expect(calls).toContainEqual({
      table: 'workspace_configs',
      method: 'eq',
      args: ['ws_id', wsId],
    });
  });
  it.each([null, '', '   '])(
    'keeps legacy bytes when centre name is %s',
    async (name) => {
      await useRealRenderer();
      flagValue = 'true';
      centreName = name;
      expect(await (await preview()).json()).toEqual({ preview: legacy });
    }
  );
  it.each(['none', 'future'])(
    'omits the official class line with %s class',
    async (kind) => {
      await useRealRenderer();
      flagValue = 'true';
      classSessions.data =
        kind === 'none'
          ? []
          : [
              {
                starts_at: '2026-11-01T09:00:00Z',
                ends_at: '2026-11-01T10:30:00Z',
                start_timezone: 'Asia/Ho_Chi_Minh',
                end_timezone: 'Asia/Ho_Chi_Minh',
                status: 'scheduled',
              },
            ];
      expect(await (await preview()).json()).toEqual({
        preview: v2.replace('Lịch học chính thức: 16:00-17:30\n', ''),
      });
    }
  );

  it('preserves a custom template byte for byte with flag off', async () => {
    await useRealRenderer();
    template = '  {{centre}}\n{{student}}\n{{unrecognized}}  ';
    expect(await (await preview()).json()).toEqual({
      preview: '  {{centre}}\nHọc sinh\n{{unrecognized}}  ',
    });
  });
  it.each(['flag', 'name'])(
    'keeps legacy output after a %s read error',
    async (kind) => {
      await useRealRenderer();
      flagValue = 'true';
      flagError = kind === 'flag';
      nameError = kind === 'name';
      expect(await (await preview()).json()).toEqual({ preview: legacy });
    }
  );
  it('keeps the legacy missing-class fallback with flag off', async () => {
    await useRealRenderer();
    classSessions.data = [];
    expect(await (await preview()).json()).toEqual({
      preview: legacy.replace('16:00-17:30', 'Chưa xác định'),
    });
  });
});
