import { describe, expect, it, vi } from 'vitest';
import { createDefaultFormStudioInput } from '../../../../../../../apps/forms/src/features/forms/schema';
import {
  downloadExtendedFormResponseFile,
  type ExtendedFormsDependencies,
  readExtendedFormPublication,
  releaseExtendedFormQuiz,
} from './operations';

const id = (value: number) =>
  `21580000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const context = { meetingId: id(1), wsId: id(2) };
const launch = {
  roomId: `${context.wsId}:${context.meetingId}`,
  launchId: id(3),
  formId: id(4),
  versionId: id(5),
  form: { id: id(4), wsId: context.wsId },
};
const actorScope = '1'.repeat(64);
const upload = {
  id: id(6),
  claimed_response_id: id(8),
  meeting_id: context.meetingId,
  ws_id: context.wsId,
  form_id: launch.formId,
  version_id: launch.versionId,
  launch_id: launch.launchId,
  question_id: id(7),
  actor_scope: actorScope,
  content_type: 'application/pdf',
  size_bytes: 3,
  ready_at: '2026-11-18T00:00:00Z',
  cleanup_started_at: null,
};
const fileRequest = {
  launchId: launch.launchId,
  responseId: id(8),
  uploadId: upload.id,
};
const publicationPolicy = {
  id: launch.versionId,
  ws_id: context.wsId,
  form_id: launch.formId,
  score_reveal: 'manual',
  answer_reveal: 'never',
};
const scope = {
  wsId: context.wsId,
  formId: launch.formId,
  versionId: launch.versionId,
  launchId: launch.launchId,
};

function publishedForm() {
  const form = createDefaultFormStudioInput();
  const [section] = form.sections;
  return {
    ...form,
    id: launch.formId,
    wsId: context.wsId,
    status: 'published',
    sections: [
      {
        ...section,
        id: id(10),
        questions: section.questions.map((question, index) => ({
          ...question,
          id: id(11 + index),
          sectionId: id(10),
        })),
      },
    ],
  };
}

const proof = {
  responseId: fileRequest.responseId,
  resolveActorScope: () => actorScope,
};

function dependencies() {
  return {
    readLaunch: vi.fn<ExtendedFormsDependencies['readLaunch']>(
      async () => launch
    ),
    requireManager: vi.fn<ExtendedFormsDependencies['requireManager']>(
      async () => {}
    ),
    authorizePublication: vi.fn<
      ExtendedFormsDependencies['authorizePublication']
    >(async () => 'anonymous'),
    readPublication: vi.fn<ExtendedFormsDependencies['readPublication']>(
      async () => null
    ),
    readManualRelease: vi.fn<ExtendedFormsDependencies['readManualRelease']>(
      async () => null
    ),
    readRevealPolicies: vi.fn<ExtendedFormsDependencies['readRevealPolicies']>(
      async () => publicationPolicy
    ),
    recordRelease: vi.fn<ExtendedFormsDependencies['recordRelease']>(
      async () => {}
    ),
    readSubmittedResponse: vi.fn<
      ExtendedFormsDependencies['readSubmittedResponse']
    >(async () => actorScope),
    readReadyUpload: vi.fn<ExtendedFormsDependencies['readReadyUpload']>(
      async () => upload
    ),
    readFileAnswer: vi.fn<ExtendedFormsDependencies['readFileAnswer']>(
      async () => [upload.id]
    ),
    download: vi.fn<ExtendedFormsDependencies['download']>(
      async () => new Blob(['abc'])
    ),
  } satisfies ExtendedFormsDependencies;
}

describe('readExtendedFormPublication', () => {
  it('projects a room-bound immutable publication and strips nested quiz keys', async () => {
    const deps = dependencies();
    const draft = createDefaultFormStudioInput();
    const [section] = draft.sections;
    const [question] = section.questions;
    const secret = 'PRIVATE_KEY_MUST_NOT_LEAK';
    deps.readPublication.mockResolvedValue({
      ...draft,
      wsId: context.wsId,
      id: launch.formId,
      status: 'published',
      quizKeys: secret,
      settings: { ...draft.settings, answerKey: secret },
      sections: [
        {
          ...section,
          id: id(10),
          answerKey: secret,
          questions: [
            {
              ...question,
              id: id(11),
              sectionId: id(10),
              correctAnswer: secret,
              options: [
                {
                  id: id(12),
                  label: 'Option',
                  value: 'option',
                  correct: secret,
                },
              ],
            },
          ],
        },
      ],
    });
    const result = await readExtendedFormPublication(
      context,
      launch.launchId,
      deps
    );
    expect(result.status).toBe('ok');
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(deps.readLaunch).toHaveBeenCalledWith(
      launch.launchId,
      'participant'
    );
    expect(deps.readPublication).toHaveBeenCalledWith({
      ...scope,
      roomId: context.meetingId,
    });
  });

  it('stops before reading the snapshot if current respondent access is denied', async () => {
    const deps = dependencies();
    deps.authorizePublication.mockRejectedValue(new Error('Forbidden'));
    await expect(
      readExtendedFormPublication(context, launch.launchId, deps)
    ).rejects.toThrow('Forbidden');
    expect(deps.readPublication).not.toHaveBeenCalled();
  });

  it.each([
    { ...launch, form: { ...launch.form, wsId: id(20) } },
    { ...launch, launchId: id(21) },
  ])(
    'rejects a room reply from the wrong workspace or launch',
    async (wrongLaunch) => {
      const deps = dependencies();
      deps.readLaunch.mockResolvedValue(wrongLaunch);
      expect(
        await readExtendedFormPublication(context, launch.launchId, deps)
      ).toEqual({ status: 'not_found' });
      expect(deps.authorizePublication).not.toHaveBeenCalled();
      expect(deps.readPublication).not.toHaveBeenCalled();
    }
  );
});

describe('readExtendedFormPublication quiz reveal', () => {
  const hidden = { score: false, answers: false };

  it('hides both channels without a confirmed response', async () => {
    const deps = dependencies();
    deps.readPublication.mockResolvedValue(publishedForm());

    expect(
      await readExtendedFormPublication(context, launch.launchId, deps)
    ).toMatchObject({ publication: { quizReveal: hidden } });
    expect(deps.readSubmittedResponse).not.toHaveBeenCalled();

    deps.readSubmittedResponse.mockResolvedValue(null);
    expect(
      await readExtendedFormPublication(context, launch.launchId, deps, proof)
    ).toMatchObject({ publication: { quizReveal: hidden } });
    expect(deps.readRevealPolicies).not.toHaveBeenCalled();
  });

  it('denies the quiz reveal for a different respondent session', async () => {
    const deps = dependencies();
    deps.readPublication.mockResolvedValue(publishedForm());
    deps.readSubmittedResponse.mockResolvedValue('9'.repeat(64));

    expect(
      await readExtendedFormPublication(context, launch.launchId, deps, proof)
    ).toMatchObject({ publication: { quizReveal: hidden } });
    expect(deps.readRevealPolicies).not.toHaveBeenCalled();
    expect(deps.readManualRelease).not.toHaveBeenCalled();
  });

  it('permits after-submit and never does not become visible with a release row', async () => {
    const deps = dependencies();
    deps.readPublication.mockResolvedValue(publishedForm());
    deps.readRevealPolicies.mockResolvedValue({
      ...publicationPolicy,
      score_reveal: 'after_submit',
    });
    deps.readManualRelease.mockResolvedValue(scope);

    expect(
      await readExtendedFormPublication(context, launch.launchId, deps, proof)
    ).toMatchObject({
      publication: { quizReveal: { score: true, answers: false } },
    });
    expect(deps.readManualRelease).not.toHaveBeenCalled();
  });

  it('permits a manual channel only for the exact release tuple', async () => {
    const deps = dependencies();
    deps.readPublication.mockResolvedValue(publishedForm());

    expect(
      await readExtendedFormPublication(context, launch.launchId, deps, proof)
    ).toMatchObject({ publication: { quizReveal: hidden } });

    deps.readManualRelease.mockResolvedValue(scope);
    expect(
      await readExtendedFormPublication(context, launch.launchId, deps, proof)
    ).toMatchObject({
      publication: { quizReveal: { score: true, answers: false } },
    });
    expect(deps.readManualRelease).toHaveBeenCalledWith({
      ...scope,
      roomId: context.meetingId,
    });
  });

  it.each([{ wsId: id(29) }, { launchId: id(29) }, { versionId: id(29) }])(
    'rejects a manual release from another scope before revealing',
    async (wrongScope) => {
      const deps = dependencies();
      deps.readPublication.mockResolvedValue(publishedForm());
      deps.readManualRelease.mockResolvedValue({ ...scope, ...wrongScope });

      expect(
        await readExtendedFormPublication(context, launch.launchId, deps, proof)
      ).toMatchObject({ publication: { quizReveal: hidden } });
    }
  );

  it('does not use a reveal policy from another workspace', async () => {
    const deps = dependencies();
    deps.readPublication.mockResolvedValue(publishedForm());
    deps.readRevealPolicies.mockResolvedValue({
      ...publicationPolicy,
      ws_id: id(29),
    });

    expect(
      await readExtendedFormPublication(context, launch.launchId, deps, proof)
    ).toMatchObject({ publication: { quizReveal: hidden } });
    expect(deps.readManualRelease).not.toHaveBeenCalled();
  });
});

describe('releaseExtendedFormQuiz', () => {
  it('gates host and manager access before accessing room state even for never', async () => {
    const deps = dependencies();
    deps.requireManager.mockRejectedValue(new Error('Forbidden'));
    deps.readRevealPolicies.mockResolvedValue({
      ...publicationPolicy,
      score_reveal: 'never',
    });
    await expect(
      releaseExtendedFormQuiz(context, launch.launchId, deps)
    ).rejects.toThrow('Forbidden');
    expect(deps.readLaunch).not.toHaveBeenCalled();
    expect(deps.readRevealPolicies).not.toHaveBeenCalled();
    expect(deps.recordRelease).not.toHaveBeenCalled();
  });

  it('records only the verified room tuple and preserves the never answer policy', async () => {
    const deps = dependencies();
    expect(
      await releaseExtendedFormQuiz(context, launch.launchId, deps)
    ).toEqual({
      status: 'released',
      score: true,
      answers: false,
    });
    expect(deps.readLaunch).toHaveBeenCalledWith(launch.launchId, 'manager');
    expect(deps.recordRelease).toHaveBeenCalledExactlyOnceWith(scope);
  });

  it.each([{ score_reveal: 'after_submit' }, { score_reveal: 'never' }])(
    'does not write a release for non-manual policies',
    async (policies) => {
      const deps = dependencies();
      deps.readRevealPolicies.mockResolvedValue({
        ...publicationPolicy,
        ...policies,
      });
      expect(
        await releaseExtendedFormQuiz(context, launch.launchId, deps)
      ).toEqual({ status: 'policy_denied' });
      expect(deps.recordRelease).not.toHaveBeenCalled();
    }
  );

  it('rejects a cross-room launch before reading release policy', async () => {
    const deps = dependencies();
    deps.readLaunch.mockResolvedValue({ ...launch, launchId: id(23) });
    expect(
      await releaseExtendedFormQuiz(context, launch.launchId, deps)
    ).toEqual({
      status: 'not_found',
    });
    expect(deps.readRevealPolicies).not.toHaveBeenCalled();
    expect(deps.recordRelease).not.toHaveBeenCalled();
  });

  it('rejects a wrong-workspace launch before reading or changing its policy', async () => {
    const deps = dependencies();
    deps.readLaunch.mockResolvedValue({
      ...launch,
      form: { ...launch.form, wsId: id(24) },
    });
    expect(
      await releaseExtendedFormQuiz(context, launch.launchId, deps)
    ).toEqual({
      status: 'not_found',
    });
    expect(deps.readRevealPolicies).not.toHaveBeenCalled();
    expect(deps.recordRelease).not.toHaveBeenCalled();
  });

  it('rejects a stale publication version without recording a release', async () => {
    const deps = dependencies();
    deps.readRevealPolicies.mockResolvedValue({
      ...publicationPolicy,
      id: id(22),
    });
    expect(
      await releaseExtendedFormQuiz(context, launch.launchId, deps)
    ).toEqual({ status: 'not_found' });
    expect(deps.recordRelease).not.toHaveBeenCalled();
  });
});

describe('downloadExtendedFormResponseFile', () => {
  it('returns the exact private file with attachment and nosniff', async () => {
    const deps = dependencies();
    const result = await downloadExtendedFormResponseFile(
      context,
      fileRequest,
      deps
    );
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('Expected the authorized file');
    expect(result.response.headers.get('content-disposition')).toBe(
      'attachment'
    );
    expect(result.response.headers.get('x-content-type-options')).toBe(
      'nosniff'
    );
    expect(result.response.headers.get('content-type')).toBe('application/pdf');
    expect(result.response.headers.get('cache-control')).toBe(
      'private, no-store'
    );
    expect(await result.response.text()).toBe('abc');
    expect(deps.readSubmittedResponse).toHaveBeenCalledWith(
      { ...scope, roomId: context.meetingId },
      fileRequest.responseId
    );
    expect(deps.download).toHaveBeenCalledExactlyOnceWith(
      [
        upload.ws_id,
        upload.version_id,
        upload.launch_id,
        upload.question_id,
        upload.id,
      ].join('/')
    );
  });

  it('does not read state, upload metadata, or Storage with insufficient authority', async () => {
    const deps = dependencies();
    deps.requireManager.mockRejectedValue(new Error('Forbidden'));
    await expect(
      downloadExtendedFormResponseFile(context, fileRequest, deps)
    ).rejects.toThrow('Forbidden');
    expect(deps.readLaunch).not.toHaveBeenCalled();
    expect(deps.readSubmittedResponse).not.toHaveBeenCalled();
    expect(deps.readReadyUpload).not.toHaveBeenCalled();
    expect(deps.download).not.toHaveBeenCalled();
  });

  it('rejects a launch from a different workspace before reading responses', async () => {
    const deps = dependencies();
    deps.readLaunch.mockResolvedValue({
      ...launch,
      form: { ...launch.form, wsId: id(24) },
    });
    expect(
      await downloadExtendedFormResponseFile(context, fileRequest, deps)
    ).toEqual({
      status: 'not_found',
    });
    expect(deps.readSubmittedResponse).not.toHaveBeenCalled();
    expect(deps.download).not.toHaveBeenCalled();
  });

  it.each([{ launchId: id(28) }, { roomId: `${context.wsId}:${id(28)}` }])(
    'rejects a wrong-launch or foreign-meeting room reply before reading response data',
    async (invalidBinding) => {
      const deps = dependencies();
      deps.readLaunch.mockResolvedValue({ ...launch, ...invalidBinding });
      expect(
        await downloadExtendedFormResponseFile(context, fileRequest, deps)
      ).toEqual({
        status: 'not_found',
      });
      expect(deps.readSubmittedResponse).not.toHaveBeenCalled();
      expect(deps.readReadyUpload).not.toHaveBeenCalled();
      expect(deps.download).not.toHaveBeenCalled();
    }
  );

  it('denies a submitted response without an exact respondent scope', async () => {
    const deps = dependencies();
    deps.readSubmittedResponse.mockResolvedValue(null);
    expect(
      await downloadExtendedFormResponseFile(context, fileRequest, deps)
    ).toEqual({ status: 'not_found' });
    expect(deps.readReadyUpload).not.toHaveBeenCalled();
    expect(deps.download).not.toHaveBeenCalled();
  });

  it.each([
    { ws_id: id(30) },
    { launch_id: id(31) },
    { version_id: id(32) },
    { meeting_id: id(32) },
    { claimed_response_id: id(32) },
    { actor_scope: '2'.repeat(64) },
    { ready_at: null },
    { cleanup_started_at: '2026-11-18T00:00:00Z' },
  ])(
    'denies a mismatched or unready upload before opening Storage',
    async (patch) => {
      const deps = dependencies();
      deps.readReadyUpload.mockResolvedValue({ ...upload, ...patch });
      expect(
        await downloadExtendedFormResponseFile(context, fileRequest, deps)
      ).toEqual({ status: 'not_found' });
      expect(deps.readFileAnswer).not.toHaveBeenCalled();
      expect(deps.download).not.toHaveBeenCalled();
    }
  );

  it('denies an upload absent from the exact submitted question answer', async () => {
    const deps = dependencies();
    deps.readFileAnswer.mockResolvedValue([id(40)]);
    expect(
      await downloadExtendedFormResponseFile(context, fileRequest, deps)
    ).toEqual({ status: 'not_found' });
    expect(deps.readFileAnswer).toHaveBeenCalledWith(
      fileRequest.responseId,
      upload.question_id
    );
    expect(deps.download).not.toHaveBeenCalled();
  });
});
