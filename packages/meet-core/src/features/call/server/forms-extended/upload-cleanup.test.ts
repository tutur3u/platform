import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultFormStudioInput } from '../../../../../../../apps/forms/src/features/forms/schema';
import { type ExtendedFormsDependencies } from './operations';
import {
  cleanupExtendedFormRespondentUploads,
  type ExtendedFormStorageFence,
  runExtendedFormUploadMaintenance,
} from './upload-cleanup';

const ports = vi.hoisted(() => ({
  rpc: vi.fn(),
  delete: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    schema: () => ({
      rpc: ports.rpc,
      from: () => ({
        delete: () => {
          const query = {
            eq: () => query,
            not: () => query,
            is: ports.delete,
          };
          return query;
        },
      }),
    }),
    storage: { from: () => ({ remove: ports.remove }) },
  }),
}));

const id = (n: number) =>
  `21580000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const context = { meetingId: id(1), wsId: id(2) };
const launch = {
  roomId: `${context.wsId}:${context.meetingId}`,
  launchId: id(3),
  formId: id(4),
  versionId: id(5),
  form: { id: id(4), wsId: context.wsId },
};
const actorScope = 'a'.repeat(64);
const row = {
  id: id(6),
  ws_id: context.wsId,
  version_id: launch.versionId,
  launch_id: launch.launchId,
  question_id: id(7),
};
const key = [
  row.ws_id,
  row.version_id,
  row.launch_id,
  row.question_id,
  row.id,
].join('/');

async function requestDependencies() {
  const draft = createDefaultFormStudioInput();
  const [section] = draft.sections;
  const forms = {
    readLaunch: vi.fn<ExtendedFormsDependencies['readLaunch']>(
      async () => launch
    ),
    authorizePublication: vi.fn<
      ExtendedFormsDependencies['authorizePublication']
    >(async () => 'anonymous'),
    readPublication: vi.fn<ExtendedFormsDependencies['readPublication']>(
      async () => ({
        ...draft,
        id: launch.formId,
        wsId: context.wsId,
        status: 'published',
        sections: [
          {
            ...section,
            id: id(8),
            questions: section.questions.map((question, index) => ({
              ...question,
              id: id(9 + index),
              sectionId: id(8),
            })),
          },
        ],
      })
    ),
    requireManager: vi.fn(),
    readRevealPolicies: vi.fn(),
    readManualRelease: vi.fn(),
    recordRelease: vi.fn(),
    readSubmittedResponse: vi.fn(),
    readReadyUpload: vi.fn(),
    readFileAnswer: vi.fn(),
    download: vi.fn(),
  } satisfies ExtendedFormsDependencies;
  return {
    context,
    launchId: launch.launchId,
    forms,
    supabase: await createAdminClient({ noCookie: true }),
    fenceStorageWrites: vi.fn<ExtendedFormStorageFence>(async ({ id }) => ({
      reservationId: id,
      state: 'sealed',
    })),
    resolveActorScope: vi.fn(() => actorScope),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  ports.rpc.mockResolvedValue({ data: [row], error: null });
  ports.remove.mockResolvedValue({ error: null });
  ports.delete.mockResolvedValue({ error: null });
});

describe('extended upload cleanup', () => {
  it('claims only the authorized form/respondent scope and fences before deleting', async () => {
    const deps = await requestDependencies();
    await expect(cleanupExtendedFormRespondentUploads(deps)).resolves.toEqual({
      status: 'ok',
      processed: 1,
      failed: 0,
    });
    expect(deps.resolveActorScope).toHaveBeenCalledWith({
      wsId: context.wsId,
      formId: launch.formId,
    });
    expect(ports.rpc).toHaveBeenCalledExactlyOnceWith(
      'claim_expired_form_respondent_uploads',
      { p_form_id: launch.formId, p_actor_scope: actorScope }
    );
    expect(deps.fenceStorageWrites).toHaveBeenCalledExactlyOnceWith(row);
    expect(ports.remove).toHaveBeenCalledExactlyOnceWith([key]);
    expect(ports.rpc.mock.invocationCallOrder[0]).toBeLessThan(
      deps.fenceStorageWrites.mock.invocationCallOrder[0]
    );
    expect(deps.fenceStorageWrites.mock.invocationCallOrder[0]).toBeLessThan(
      ports.remove.mock.invocationCallOrder[0]
    );
    expect(ports.remove.mock.invocationCallOrder[0]).toBeLessThan(
      ports.delete.mock.invocationCallOrder[0]
    );
  });

  it('denies a cross-workspace launch before claiming any rows', async () => {
    const deps = await requestDependencies();
    deps.forms.readLaunch.mockResolvedValue({
      ...launch,
      form: { ...launch.form, wsId: id(30) },
    });
    await expect(cleanupExtendedFormRespondentUploads(deps)).resolves.toEqual({
      status: 'not_found',
    });
    expect(ports.rpc).not.toHaveBeenCalled();
  });

  it('rejects an oversized claim batch before fencing or deleting', async () => {
    const deps = await requestDependencies();
    ports.rpc.mockResolvedValue({
      data: Array.from({ length: 21 }, () => row),
      error: null,
    });
    await expect(cleanupExtendedFormRespondentUploads(deps)).rejects.toThrow();
    expect(deps.fenceStorageWrites).not.toHaveBeenCalled();
    expect(ports.remove).not.toHaveBeenCalled();
    expect(ports.delete).not.toHaveBeenCalled();
  });

  it('retains metadata when a writer has not settled', async () => {
    const deps = await requestDependencies();
    deps.fenceStorageWrites.mockRejectedValue(new Error('Writer still active'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(cleanupExtendedFormRespondentUploads(deps)).resolves.toEqual(
        {
          status: 'ok',
          processed: 1,
          failed: 1,
        }
      );
      expect(ports.remove).not.toHaveBeenCalled();
      expect(ports.delete).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it('rejects a write fence receipt for another reservation', async () => {
    const deps = await requestDependencies();
    deps.fenceStorageWrites.mockResolvedValue({
      reservationId: id(31),
      state: 'sealed',
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(cleanupExtendedFormRespondentUploads(deps)).resolves.toEqual(
        {
          status: 'ok',
          processed: 1,
          failed: 1,
        }
      );
      expect(ports.remove).not.toHaveBeenCalled();
      expect(ports.delete).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it('retains metadata if Storage removal fails', async () => {
    const deps = await requestDependencies();
    ports.remove.mockResolvedValue({
      error: { message: 'Storage unavailable' },
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(cleanupExtendedFormRespondentUploads(deps)).resolves.toEqual(
        {
          status: 'ok',
          processed: 1,
          failed: 1,
        }
      );
      expect(ports.delete).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it('uses one global claim only from the separate maintenance entry', async () => {
    const deps = await requestDependencies();
    await expect(
      runExtendedFormUploadMaintenance({
        supabase: deps.supabase,
        fenceStorageWrites: deps.fenceStorageWrites,
      })
    ).resolves.toEqual({ processed: 1, failedIds: [] });
    expect(ports.rpc).toHaveBeenCalledExactlyOnceWith(
      'claim_expired_form_respondent_uploads',
      { p_form_id: null, p_actor_scope: null }
    );
    expect(deps.forms.readLaunch).not.toHaveBeenCalled();
    expect(ports.delete).toHaveBeenCalledOnce();
  });
});
