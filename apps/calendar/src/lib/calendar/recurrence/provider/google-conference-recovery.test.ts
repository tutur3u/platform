import type { calendar_v3 } from '@tuturuuu/google';
import { describe, expect, it, vi } from 'vitest';
import { providerFutureCreateMetadata } from './create-metadata';
import { recoverFailedGoogleConference } from './google-conference-recovery';

const metadata = providerFutureCreateMetadata(
  'google',
  {
    organizer: { self: true },
    conferenceData: {
      conferenceId: 'old',
      conferenceSolution: { key: { type: 'hangoutsMeet' } },
    },
    hangoutLink: 'https://meet.google.com/old-fixture',
  },
  'operation'
);
if (metadata.provider !== 'google') throw new Error('expected Google');
const base = metadata.fields.conferenceData!.createRequest.requestId;
const failed: calendar_v3.Schema$Event = {
  id: 'replacement',
  etag: 'v1',
  conferenceData: {
    createRequest: { requestId: base, status: { statusCode: 'failure' } },
  },
};
function fixture(event = failed) {
  const patch = vi.fn(
    async ({ requestBody }: { requestBody: calendar_v3.Schema$Event }) => ({
      data: { ...event, ...requestBody, etag: 'v2' },
    })
  );
  const authorize = vi.fn(async () => {});
  const args = {
    calendar: { events: { patch } } as unknown as calendar_v3.Calendar,
    calendarId: 'fixture-calendar',
    event,
    metadata,
    authorize,
  };
  return { args, patch, authorize };
}
describe('bounded Google conference regeneration', () => {
  it('changes only conference creation identity on the retained replacement with revision precondition', async () => {
    const { args, patch, authorize } = fixture();
    const result = await recoverFailedGoogleConference(args);
    expect(result.id).toBe('replacement');
    expect(result.conferenceData?.createRequest?.requestId).not.toBe(base);
    expect(patch).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'replacement',
        conferenceDataVersion: 1,
        requestBody: {
          conferenceData: {
            createRequest: {
              requestId: result.conferenceData?.createRequest?.requestId,
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          },
        },
      }),
      { headers: { 'If-Match': 'v1' } }
    );
    expect(authorize.mock.invocationCallOrder[0]).toBeLessThan(
      patch.mock.invocationCallOrder[0]!
    );
  });
  it('limits generation attempts without creating or trimming another event', async () => {
    const first = fixture();
    const retry1 = await recoverFailedGoogleConference(first.args);
    const second = fixture({
      ...retry1,
      conferenceData: {
        createRequest: {
          requestId: retry1.conferenceData?.createRequest?.requestId,
          status: { statusCode: 'failure' },
        },
      },
    });
    const retry2 = await recoverFailedGoogleConference(second.args);
    const exhausted = fixture({
      ...retry2,
      conferenceData: {
        createRequest: {
          requestId: retry2.conferenceData?.createRequest?.requestId,
          status: { statusCode: 'failure' },
        },
      },
    });
    await expect(recoverFailedGoogleConference(exhausted.args)).rejects.toThrow(
      'budget exhausted'
    );
    expect(exhausted.patch).not.toHaveBeenCalled();
  });
  it.each(['pending', 'success'])(
    'does not replace an existing %s request',
    async (statusCode) => {
      const { args, patch } = fixture({
        ...failed,
        conferenceData: {
          createRequest: { requestId: base, status: { statusCode } },
        },
      });
      expect(await recoverFailedGoogleConference(args)).toBe(args.event);
      expect(patch).not.toHaveBeenCalled();
    }
  );
  it('rejects an unknown provider generation identity rather than overwriting it', async () => {
    const { args, patch } = fixture({
      ...failed,
      conferenceData: {
        createRequest: {
          requestId: 'unknown',
          status: { statusCode: 'failure' },
        },
      },
    });
    await expect(recoverFailedGoogleConference(args)).rejects.toThrow(
      'budget exhausted'
    );
    expect(patch).not.toHaveBeenCalled();
  });
  it('rechecks actor access before regenerating a conference', async () => {
    const { args, patch, authorize } = fixture();
    authorize.mockRejectedValueOnce(new Error('revoked'));
    await expect(recoverFailedGoogleConference(args)).rejects.toThrow(
      'revoked'
    );
    expect(patch).not.toHaveBeenCalled();
  });
});
